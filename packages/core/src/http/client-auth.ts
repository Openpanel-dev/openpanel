// Where API/SDK credentials become a client principal.
//
// V1 has five near-identical validators — `validateSdkRequest`,
// `validateExportRequest`, `validateImportRequest`, `validateManageRequest`
// and the MCP copy — that differ only by the accepted `ClientType` set and by
// the ingest extension. They collapse into this one function (ADR-011 A-i).
//
// M8-002 filled in the INGEST branch — `modules/ingest/src/client-auth.ts`
// holds V1's `validateSdkRequest` verbatim, and this file adapts it onto the
// principal. M15-009 inverted how it gets there: transport may not deep-import
// a module (ADR-022 R22), so the route that wants the ingest tier hands its own
// validator down as `clientAuth: { ingest: validateIngestRequest }`.
//
// M9-004 filled in the `allow`-list tier, which is the one V1
// spells three times (`validateExportRequest`, `validateImportRequest`,
// `validateManageRequest`): identical bodies differing only by the accepted
// `ClientType` set and by the prefix on their error strings. `allow` carries
// that difference and the three collapse into `authenticateAllowedClient`
// below. MCP is NOT here — it authenticates its own `token` form inside
// `modules/mcp/src/auth.ts`, exactly as V1's mcp router did.

import type { DbScope } from '../cacheable-per-deps';
import type { HttpCtx } from '../context';
import { verifyClientSecret } from '../shared/client-secret';
import { headerValue, type IngestHeaders } from '../shared/headers';

/** V1 refuses a client id that is not a UUID before it ever queries
 *  (utils/auth.ts's three validators). Same regex, same order. */
const CLIENT_ID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLIENT_ID_HEADER = 'openpanel-client-id';
const CLIENT_SECRET_HEADER = 'openpanel-client-secret';

/** Prisma's `ClientType` enum, by value. Moves to client.constants.ts in P7. */
export type ClientType = 'read' | 'write' | 'root';

export interface AuthenticatedClient {
  id: string;
  /** `null` for a root client, which is scoped to `organizationId` instead. */
  projectId: string | null;
  /** Every client — read/write/root alike — belongs to exactly one org. */
  organizationId: string;
  type: ClientType;
  /**
   * Whether the supplied client secret VERIFIED against the stored hash.
   * `isBotHook` reads it as "this is a server-side SDK, never a bot", so it
   * follows the verification result, not the presence of a secret string
   * (main #481). The side-channel survives as a field on the principal
   * (ADR-011 A-i).
   */
  secretVerified: boolean;
}

/**
 * The surface's name in a refusal message. V1's three validators are the same
 * function with a different prefix — `Export: Invalid client secret` — and
 * those strings are the 401 BODY on `/export`, `/insights`, `/import` and
 * `/manage`, so they are a wire contract, not decoration.
 */
export type ClientAuthLabel = 'Export' | 'Import' | 'Manage';

/**
 * What the ingest tier answers, as transport reads it.
 * `modules/ingest/src/client-auth.ts` owns the rules and returns a wider
 * outcome; only these fields cross the layer boundary.
 */
export type IngestTierOutcome =
  | {
      ok: true;
      client: {
        id: string;
        projectId: string | null;
        organizationId: string;
        type: ClientType;
      };
      secretVerified: boolean;
    }
  | { ok: false; message: string; secretVerified: boolean };

/** The ingest tier itself, passed in by the route that wants it. */
export type ValidateIngestRequest = (args: {
  deps: DbScope;
  headers: IngestHeaders;
  clientIp: string | undefined;
  body: unknown;
}) => Promise<IngestTierOutcome>;

export interface ClientAuthOptions {
  /** Which client types may pass. Omitted means any, as `validateSdkRequest`. */
  allow?: ClientType[];
  /** Which of V1's three validators this route was served by. */
  label?: ClientAuthLabel;
  /** The ingest extension described above, supplied by the ingest module. */
  ingest?: ValidateIngestRequest;
  /** MCP presents `base64(clientId:clientSecret)` instead of the two headers. */
  token?: 'basic';
}

/**
 * A refusal is returned, never thrown — same reason
 * `modules/ingest/src/client-auth.ts` gives, and it keeps the two 401 BODIES
 * V1 has (plain text on the ingest routes, `{error, message}` JSON on the
 * allow-list ones) a decision of the macro rather than of this function.
 */
export type ClientAuthResult =
  | { ok: true; client: AuthenticatedClient }
  | { ok: false; ingest: boolean; message: string };

/** What the ingest tier needs beyond the headers: V1 reads the attribution ip
 *  and the body (credential fallback, profile filter, `__revenue` gate). */
export interface ClientAuthRequest {
  ip: string;
  body: unknown;
}

/**
 * M15-005: takes the request's own `Ctx`, not the boot scope. The ingest tier
 * reads only `ctx.db` — `getClientByIdCached`'s L1 is keyed on the Postgres
 * client, so `/track` reaches the one process-lived cache without forcing
 * `ctx.services`. The allow-list tier is not a hot path and goes through
 * `ctx.services.client` like every other handler.
 */
export async function authenticateClient(
  ctx: HttpCtx,
  headers: IngestHeaders,
  options: ClientAuthOptions,
  request?: ClientAuthRequest
): Promise<ClientAuthResult> {
  if (!options.ingest) {
    return await authenticateAllowedClient(ctx, headers, options);
  }

  const outcome = await options.ingest({
    deps: ctx,
    headers,
    clientIp: request?.ip,
    body: request?.body,
  });

  if (!outcome.ok) {
    return { ok: false, ingest: true, message: outcome.message };
  }

  const { client } = outcome;
  return {
    ok: true,
    client: {
      id: client.id,
      projectId: client.projectId,
      organizationId: client.organizationId,
      type: client.type,
      secretVerified: outcome.secretVerified,
    },
  };
}

/** V1's per-validator "wrong type" message; every other refusal differs only
 *  by the label prefix. */
const FORBIDDEN_TYPE_MESSAGE: Record<ClientAuthLabel, string> = {
  Export: 'Export: Client is not allowed to export',
  Import: 'Import: Client is not allowed to import',
  Manage: 'Manage: Only root clients are allowed to manage resources',
};

/** V1 mapped a Prisma lookup failure onto its own message, unprefixed. */
const MALFORMED_CLIENT_ID_MESSAGE = 'Client ID seems to be malformed';
const PRISMA_KNOWN_REQUEST_ERROR = 'PrismaClientKnownRequestError';
const UNEXPECTED_MESSAGE = 'Unexpected error';

/**
 * The `allow`-list tier: V1's `validateExportRequest` / `validateImportRequest`
 * / `validateManageRequest`, which differ only by the accepted `ClientType`
 * set and by the label their messages carry.
 *
 * `secretVerified` is true on success by construction: this tier verifies the
 * secret, so reaching the return means one was presented and matched.
 */
async function authenticateAllowedClient(
  ctx: HttpCtx,
  headers: IngestHeaders,
  options: ClientAuthOptions
): Promise<ClientAuthResult> {
  const label = options.label ?? 'Export';
  const refuse = (message: string): ClientAuthResult => ({
    ok: false,
    ingest: false,
    message,
  });

  const clientId = headerValue(headers, CLIENT_ID_HEADER) ?? '';
  const clientSecret = headerValue(headers, CLIENT_SECRET_HEADER) ?? '';

  if (!CLIENT_ID_UUID_REGEX.test(clientId)) {
    return refuse(`${label}: Client ID must be a valid UUIDv4`);
  }

  try {
    const client = await ctx.services.client.getClientByIdCached(clientId);
    if (!client) {
      return refuse(`${label}: Invalid client id`);
    }
    if (!client.secret) {
      return refuse(`${label}: Client has no secret`);
    }
    if (options.allow && !options.allow.includes(client.type as ClientType)) {
      return refuse(FORBIDDEN_TYPE_MESSAGE[label]);
    }
    if (!(await verifyClientSecret(clientSecret, client.secret))) {
      return refuse(`${label}: Invalid client secret`);
    }

    return {
      ok: true,
      client: {
        id: client.id,
        projectId: client.projectId,
        organizationId: client.organizationId,
        type: client.type as ClientType,
        secretVerified: true,
      },
    };
  } catch (error) {
    return refuse(
      (error as { name?: string })?.name === PRISMA_KNOWN_REQUEST_ERROR
        ? MALFORMED_CLIENT_ID_MESSAGE
        : UNEXPECTED_MESSAGE
    );
  }
}
