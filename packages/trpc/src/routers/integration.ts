import { z } from 'zod';

import { BASE_INTEGRATIONS, db } from '@openpanel/db';

import {
  carryOverConfigSecrets,
  encryptConfigSecrets,
  findEncryptedSecretField,
  findMissingSecretFields,
  getServerIntegration,
  redactConfigSecrets,
} from '@openpanel/integrations/src/registry';
import { getSlackInstallUrl } from '@openpanel/integrations/src/slack';
import {
  type IIntegrationConfig,
  type ISlackConfig,
  zCreateGCSExportIntegration,
  zCreateS3ExportIntegration,
  zCreateSlackIntegration,
  zIntegrationConfig,
} from '@openpanel/validation';
import {
  getOrganizationAccess,
  requireOrganizationAdmin,
  requireProjectAccess,
} from '../access';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

// Assert the user can act on the project at `level`, and return the project's
// organizationId (still stored on the integration for org-level queries/cascades).
async function assertProjectAccessAndGetOrg(
  userId: string,
  projectId: string,
  level: 'read' | 'write',
) {
  await requireProjectAccess({ userId, projectId, level });

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { organizationId: true },
  });
  return project.organizationId;
}

// Credentials are write-only: they are encrypted at rest and never travel back
// to a client. `read` on a project is bare membership, so returning the stored
// ciphertext would hand every project member the org's object-store keys — and
// because `decryptCredential` accepts any `enc:` blob under the single global
// key, that ciphertext is a replayable bearer token, not an opaque handle.
//
// Every procedure that returns an integration row — here and in the
// notification router, which embeds the rows attached to each rule — goes
// through this. Returning a row straight from Prisma is how the Slack bot token,
// the Slack incoming-webhook url and webhook header values reached any client
// that could list notification rules.
export function redactIntegration<T extends { config: unknown }>(
  integration: T,
): T {
  const config = redactConfigSecrets(integration.config);
  return config === integration.config ? integration : { ...integration, config };
}

// A client never legitimately holds a ciphertext (see redactIntegration), so
// one arriving on the wire is an attempt to replay a secret lifted from another
// integration into an attacker-chosen destination.
function rejectEncryptedSecrets(config: unknown) {
  const field = findEncryptedSecretField(config);
  if (field) {
    throw new TRPCBadRequestError(
      `\`${field}\` looks like a stored, already-encrypted value. Paste the real credential, or leave it blank to keep the current one.`,
    );
  }
}

// Shared create/update path for any form-configured integration. All per-type
// behavior (validation, connection test, credential encryption) is delegated to
// the integration's server plugin — adding a new integration needs no change here.
async function upsertIntegration(
  userId: string,
  input: {
    id?: string;
    name: string;
    projectId: string;
    config: IIntegrationConfig;
  },
) {
  // Authorize first. For an update, authorize against the EXISTING integration's
  // scope — not the attacker-controlled input.projectId — so a user with access
  // to one project can't update another project's integration in the same org.
  rejectEncryptedSecrets(input.config);

  let organizationId: string;
  let storedConfig: unknown;
  if (input.id) {
    const existing = await db.integration.findUniqueOrThrow({
      where: { id: input.id },
      select: { projectId: true, organizationId: true, config: true },
    });
    await assertIntegrationAccess(userId, existing, 'write');
    organizationId = existing.organizationId;
    storedConfig = existing.config;
  } else {
    organizationId = await assertProjectAccessAndGetOrg(
      userId,
      input.projectId,
      'write',
    );
  }

  // A blank secret means "keep the stored one" — the client can't resubmit what
  // it was never given. On create there is nothing to fall back to.
  const submitted = input.id
    ? carryOverConfigSecrets(input.config, storedConfig)
    : input.config;

  const missing = findMissingSecretFields(submitted);
  if (missing.length > 0) {
    throw new TRPCBadRequestError(
      `Missing credential${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    );
  }

  const plugin = getServerIntegration(submitted.type);

  const validation = plugin.validateConfig?.(submitted);
  if (validation && !validation.valid) {
    throw new TRPCBadRequestError(`Invalid config: ${validation.error}`);
  }

  // Test the connection with the real credentials before saving. `submitted`
  // may carry a still-encrypted value forward from the stored row; the adapters
  // decrypt on construction, so this works for both new and carried-over keys.
  const testResult = await plugin.testConnection?.(submitted);
  if (testResult && !testResult.success) {
    throw new TRPCBadRequestError(`Failed to connect: ${testResult.error}`);
  }

  const config = encryptConfigSecrets(submitted);

  // The stored row holds more than the caller sent: secrets carried over from
  // the previous config, and the encrypted ones as ciphertext. Neither may go
  // back out.
  const row = input.id
    ? await db.integration.update({
        where: { id: input.id, organizationId },
        data: { name: input.name, config },
      })
    : await db.integration.create({
        data: {
          name: input.name,
          organizationId,
          projectId: input.projectId,
          config,
        },
      });

  return redactIntegration(row);
}

// Access check for an existing integration of either scope. Project-scoped rows
// go through the project ladder; legacy org-wide rows (projectId null) have no
// project access level to consult, so a write to one — it is shared by every
// project in the org — is admin-tier, while a read only needs membership.
async function assertIntegrationAccess(
  userId: string,
  integration: { projectId: string | null; organizationId: string },
  level: 'read' | 'write',
) {
  if (integration.projectId) {
    await requireProjectAccess({
      userId,
      projectId: integration.projectId,
      level,
    });
    return;
  }

  if (level === 'write') {
    await requireOrganizationAdmin({
      userId,
      organizationId: integration.organizationId,
      message: 'Only organization admins can change an org-wide integration',
    });
    return;
  }

  const access = await getOrganizationAccess({
    userId,
    organizationId: integration.organizationId,
  });
  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this integration');
  }
}

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      await assertIntegrationAccess(ctx.session.userId, integration, 'read');

      return redactIntegration(integration);
    }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
        'read',
      );

      const integrations = await db.integration.findMany({
        where: {
          // The project's own integrations, plus legacy org-wide integrations
          // (projectId null) so they stay visible/selectable during the
          // transition off org-scoping.
          OR: [
            { projectId: input.projectId },
            { projectId: null, organizationId },
          ],
          config: {
            not: {},
          },
        },
      });

      return [...BASE_INTEGRATIONS, ...integrations.map(redactIntegration)];
    }),
  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(async ({ input, ctx }) => {
      // For an update, authorize against the existing integration's scope so a
      // user can't clear/re-install another project's Slack integration.
      let organizationId: string;
      // Carried into the OAuth metadata and the post-callback redirect, so it
      // has to be the row's own project — not whatever `input` asked for, which
      // on an update is unauthorized and may point at a different project.
      let projectId: string;
      if (input.id) {
        const existing = await db.integration.findUniqueOrThrow({
          where: { id: input.id },
          select: { projectId: true, organizationId: true },
        });
        await assertIntegrationAccess(ctx.session.userId, existing, 'write');
        organizationId = existing.organizationId;
        projectId = existing.projectId ?? input.projectId;
      } else {
        organizationId = await assertProjectAccessAndGetOrg(
          ctx.session.userId,
          input.projectId,
          'write',
        );
        projectId = input.projectId;
      }

      const res = input.id
        ? await db.integration.update({
            where: {
              id: input.id,
              organizationId,
            },
            data: {
              name: input.name,
              // This is empty and will be filled by the webhook
              config: {} as ISlackConfig,
            },
          })
        : await db.integration.create({
            data: {
              name: input.name,
              organizationId,
              projectId: input.projectId,
              // This is empty and will be filled by the webhook
              config: {} as ISlackConfig,
            },
          });

      return {
        ...res,
        slackInstallUrl: await getSlackInstallUrl({
          integrationId: res.id,
          organizationId,
          projectId,
        }),
      };
    }),
  // Generic create/update for any form-configured integration. Per-type
  // behavior lives in the server plugin; no switch here.
  createOrUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      }),
    )
    .mutation(({ input, ctx }) => upsertIntegration(ctx.session.userId, input)),
  // Back-compat alias for the export forms; delegates to the same generic path.
  // TODO: remove once the dashboard calls `createOrUpdate` directly.
  createOrUpdateExport: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) => upsertIntegration(ctx.session.userId, input)),
  // Generic, registry-driven connection test. Gated on project write access:
  // it makes the server connect outbound to a caller-supplied destination with
  // caller-supplied credentials, so it must not be reachable by anyone who
  // merely holds a session.
  testConnection: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      rejectEncryptedSecrets(input.config);

      return (
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: true }
      );
    }),
  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      rejectEncryptedSecrets(input.config);

      return (
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: false, error: 'Unknown export type' }
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id,
        },
      });

      await assertIntegrationAccess(ctx.session.userId, integration, 'write');

      await db.integration.delete({
        where: {
          id,
        },
      });

      // The deleted row still carries its config; the client only needs to
      // know which id is gone.
      return { id };
    }),
});
