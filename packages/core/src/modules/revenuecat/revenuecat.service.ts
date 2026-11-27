import { createHash, randomBytes } from 'node:crypto';
import { decryptCredential, encryptCredential } from '@openpanel/shared/server';
import type { DbScope } from '../../cacheable-per-deps';
import type { ServiceDeps, Services } from '../../services';

export const REVENUECAT_TOKEN_PREFIX = 'rcwh_';

export interface IRevenueCatWebhookView {
  enabled: boolean;
  canWrite: boolean;
  /** Only for a caller who may write the project. */
  authorization: string | null;
  lastEventAt: Date | null;
  lastEventType: string | null;
  createdAt: Date | null;
}

export interface IRevenueCatWebhookOwner {
  id: string;
  projectId: string;
  organizationId: string;
}

export function newRevenueCatToken(): string {
  return `${REVENUECAT_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function hashRevenueCatToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function revenueCatAuthorization(token: string): string {
  return `Bearer ${token}`;
}

export async function findRevenueCatWebhookByToken(
  deps: DbScope,
  token: string
): Promise<IRevenueCatWebhookOwner | null> {
  const row = await deps.db.revenueCatWebhook.findUnique({
    where: { tokenHash: hashRevenueCatToken(token) },
    select: {
      id: true,
      projectId: true,
      project: { select: { organizationId: true } },
    },
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.project.organizationId,
  };
}

export function createRevenueCatService(
  deps: ServiceDeps,
  _services: () => Services
) {
  const encrypt = (token: string) =>
    encryptCredential(deps.config.encryptionKey, token);
  const decrypt = (stored: string) =>
    decryptCredential(deps.config.encryptionKey, stored);

  async function view(
    projectId: string,
    { withSecret }: { withSecret: boolean }
  ): Promise<IRevenueCatWebhookView> {
    const row = await deps.db.revenueCatWebhook.findUnique({
      where: { projectId },
    });
    if (!row) {
      return {
        enabled: false,
        canWrite: withSecret,
        authorization: null,
        lastEventAt: null,
        lastEventType: null,
        createdAt: null,
      };
    }
    return {
      enabled: true,
      canWrite: withSecret,
      authorization: withSecret
        ? revenueCatAuthorization(decrypt(row.token))
        : null,
      lastEventAt: row.lastEventAt,
      lastEventType: row.lastEventType,
      createdAt: row.createdAt,
    };
  }

  async function writeToken(
    projectId: string,
    { reset }: { reset: boolean }
  ): Promise<void> {
    const token = newRevenueCatToken();
    const data = {
      token: encrypt(token),
      tokenHash: hashRevenueCatToken(token),
    };
    await deps.db.revenueCatWebhook.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: reset ? { ...data, lastEventAt: null, lastEventType: null } : {},
    });
  }

  async function enable(projectId: string): Promise<IRevenueCatWebhookView> {
    await writeToken(projectId, { reset: false });
    return view(projectId, { withSecret: true });
  }

  async function rotate(projectId: string): Promise<IRevenueCatWebhookView> {
    await writeToken(projectId, { reset: true });
    return view(projectId, { withSecret: true });
  }

  async function disable(projectId: string): Promise<IRevenueCatWebhookView> {
    await deps.db.revenueCatWebhook.deleteMany({ where: { projectId } });
    return view(projectId, { withSecret: false });
  }

  return { view, enable, rotate, disable };
}

export async function recordRevenueCatDelivery(
  deps: DbScope,
  projectId: string,
  eventType: string
): Promise<void> {
  await deps.db.revenueCatWebhook.updateMany({
    where: { projectId },
    data: { lastEventAt: new Date(), lastEventType: eventType },
  });
}
