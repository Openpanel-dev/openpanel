import { beforeEach, expect, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import {
  createRevenueCatService,
  findRevenueCatWebhookByToken,
  hashRevenueCatToken,
  recordRevenueCatDelivery,
} from './revenuecat.service';
import { webhookTokenFromAuthorization } from './src/auth';

const ENCRYPTION_KEY = 'ab'.repeat(32);
const PROJECT_ID = 'acme-app';
const ORGANIZATION_ID = 'org_1';

interface Row {
  id: string;
  projectId: string;
  token: string;
  tokenHash: string;
  lastEventAt: Date | null;
  lastEventType: string | null;
  createdAt: Date;
}

const rows = new Map<string, Row>();

type Where = { projectId?: string; tokenHash?: string };
const find = (where: Where) =>
  [...rows.values()].find(
    (row) =>
      (where.projectId === undefined || row.projectId === where.projectId) &&
      (where.tokenHash === undefined || row.tokenHash === where.tokenHash)
  ) ?? null;

const revenueCatWebhook = {
  findUnique: async ({ where }: { where: Where }) => {
    const row = find(where);
    return row && { ...row, project: { organizationId: ORGANIZATION_ID } };
  },
  upsert: async ({
    where,
    create,
    update,
  }: {
    where: { projectId: string };
    create: Pick<Row, 'projectId' | 'token' | 'tokenHash'>;
    update: Partial<Row>;
  }) => {
    const existing = find(where);
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const row: Row = {
      id: `wh_${rows.size + 1}`,
      lastEventAt: null,
      lastEventType: null,
      createdAt: new Date(),
      ...create,
    };
    rows.set(row.id, row);
    return row;
  },
  updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const row = find(where);
    if (row) {
      Object.assign(row, data);
    }
    return { count: row ? 1 : 0 };
  },
  deleteMany: async ({ where }: { where: Where }) => {
    const row = find(where);
    if (row) {
      rows.delete(row.id);
    }
    return { count: row ? 1 : 0 };
  },
};

const deps = {
  db: { revenueCatWebhook },
  config: { encryptionKey: ENCRYPTION_KEY },
} as unknown as ServiceDeps;
const service = createRevenueCatService(deps, testServices());

function tokenOf(authorization: string | null): string {
  const token = webhookTokenFromAuthorization({
    authorization: authorization ?? '',
  });
  if (!token) {
    throw new Error('no webhook token in the header');
  }
  return token;
}

beforeEach(() => rows.clear());

test('a project starts without a webhook', async () => {
  expect(await service.view(PROJECT_ID, { withSecret: true })).toEqual({
    enabled: false,
    canWrite: true,
    authorization: null,
    lastEventAt: null,
    lastEventType: null,
    createdAt: null,
  });
});

test('turning it on gives a header that finds the project', async () => {
  const view = await service.enable(PROJECT_ID);
  expect(view.enabled).toBe(true);
  expect(view.authorization).toMatch(/^Bearer rcwh_[\w-]{32}$/);

  const owner = await findRevenueCatWebhookByToken(
    deps,
    tokenOf(view.authorization)
  );
  expect(owner).toEqual({
    id: 'wh_1',
    projectId: PROJECT_ID,
    organizationId: ORGANIZATION_ID,
  });
});

test('the token is stored encrypted, and only its hash finds it', async () => {
  const view = await service.enable(PROJECT_ID);
  const token = tokenOf(view.authorization);
  const [row] = [...rows.values()];
  expect(row?.token.startsWith('enc:')).toBe(true);
  expect(row?.token).not.toContain(token);
  expect(row?.tokenHash).toBe(hashRevenueCatToken(token));
});

test('turning it on twice keeps the same header', async () => {
  const first = await service.enable(PROJECT_ID);
  const second = await service.enable(PROJECT_ID);
  expect(second.authorization).toBe(first.authorization);
});

test('a reader sees that it is on but not the header', async () => {
  await service.enable(PROJECT_ID);
  const view = await service.view(PROJECT_ID, { withSecret: false });
  expect(view.enabled).toBe(true);
  expect(view.canWrite).toBe(false);
  expect(view.authorization).toBeNull();
});

test('a new header ends the old one and clears the last event', async () => {
  const first = await service.enable(PROJECT_ID);
  await recordRevenueCatDelivery(deps, PROJECT_ID, 'TEST');
  const second = await service.rotate(PROJECT_ID);

  expect(second.authorization).not.toBe(first.authorization);
  expect(second.lastEventAt).toBeNull();
  expect(
    await findRevenueCatWebhookByToken(deps, tokenOf(first.authorization))
  ).toBeNull();
  expect(
    await findRevenueCatWebhookByToken(deps, tokenOf(second.authorization))
  ).not.toBeNull();
});

test('each delivery is recorded with its type', async () => {
  await service.enable(PROJECT_ID);
  await recordRevenueCatDelivery(deps, PROJECT_ID, 'TEST');
  const view = await service.view(PROJECT_ID, { withSecret: false });
  expect(view.lastEventType).toBe('TEST');
  expect(view.lastEventAt).toBeInstanceOf(Date);
});

test('turning it off ends the header', async () => {
  const view = await service.enable(PROJECT_ID);
  expect((await service.disable(PROJECT_ID)).enabled).toBe(false);
  expect(
    await findRevenueCatWebhookByToken(deps, tokenOf(view.authorization))
  ).toBeNull();
});

test('a client header is not read as a webhook token', () => {
  const clientHeader = `Bearer ${btoa('client-id:sec_secret')}`;
  expect(
    webhookTokenFromAuthorization({ authorization: clientHeader })
  ).toBeNull();
});
