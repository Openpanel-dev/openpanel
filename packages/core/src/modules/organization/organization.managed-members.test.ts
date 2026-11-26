import { afterAll, beforeAll, expect, test } from 'bun:test';
import { testServiceDeps } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';

let deps: ServiceDeps;
let subject: typeof import('./organization.service');
let lookups: typeof import('../../shared/access-lookups');

const PREFIX = 'managed-members-test';
const ORG_ID = `${PREFIX}-org`;
const OTHER_ORG_ID = `${PREFIX}-other-org`;
const OWNER_ID = `${PREFIX}-owner`;
const OWNER_EMAIL = `${PREFIX}-owner@openpanel.test`;
const PROD = `${PREFIX}-prod`;
const DEV = `${PREFIX}-dev`;
const FOREIGN = `${PREFIX}-foreign`;
/** Creating and migrating the test databases on a fresh runner. */
const BOOTSTRAP_TIMEOUT_MS = 30_000;

const email = (name: string) => `${PREFIX}-${name}@openpanel.test`;

async function cleanUp() {
  await deps.db.organization.deleteMany({
    where: { id: { in: [ORG_ID, OTHER_ORG_ID] } },
  });
  await deps.db.user.deleteMany({
    where: { email: { startsWith: `${PREFIX}-` } },
  });
}

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  subject = await import('./organization.service');
  lookups = await import('../../shared/access-lookups');
  deps = await testServiceDeps();
  await cleanUp();
  await deps.db.user.create({
    data: { id: OWNER_ID, email: OWNER_EMAIL, emailVerified: true },
  });
  for (const id of [ORG_ID, OTHER_ORG_ID]) {
    await deps.db.organization.create({
      data: { id, name: id, createdByUserId: OWNER_ID },
    });
  }
  await deps.db.member.create({
    data: {
      organizationId: ORG_ID,
      userId: OWNER_ID,
      email: OWNER_EMAIL,
      role: 'owner',
    },
  });
  for (const [id, organizationId] of [
    [PROD, ORG_ID],
    [DEV, ORG_ID],
    [FOREIGN, OTHER_ORG_ID],
  ] as const) {
    await deps.db.project.create({ data: { id, name: id, organizationId } });
  }
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(cleanUp);

const accessTo = (userId: string, projectId: string) =>
  lookups.getProjectAccess({ userId, projectId });

test('a new person becomes a verified user with access to the selected projects only', async () => {
  const result = await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('ada').toUpperCase(),
    role: 'member',
    projectScope: 'selected',
    projects: [{ projectId: PROD, level: 'write' }],
    firstName: 'Ada',
    lastName: 'Lovelace',
  });

  expect(result.ok).toBe(true);
  const user = await deps.db.user.findUniqueOrThrow({
    where: { email: email('ada') },
  });
  expect(user.emailVerified).toBe(true);
  expect(user.name).toBe('Ada Lovelace');
  expect(await accessTo(user.id, PROD)).toEqual({ level: 'write' });
  expect(await accessTo(user.id, DEV)).toBeNull();
});

test('a read grant lets a member look but not write', async () => {
  const result = await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('bob'),
    role: 'member',
    projectScope: 'selected',
    projects: [
      { projectId: PROD, level: 'write' },
      { projectId: DEV, level: 'read' },
    ],
  });

  if (!result.ok) {
    throw new Error(`put refused: ${result.reason}`);
  }
  expect(await accessTo(result.member.userId, DEV)).toEqual({
    level: 'read',
  });
});

test('changing the grants takes effect at once, even after a cached lookup', async () => {
  const first = await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('cy'),
    role: 'member',
    projectScope: 'selected',
    projects: [{ projectId: PROD, level: 'write' }],
  });
  if (!first.ok) {
    throw new Error(`put refused: ${first.reason}`);
  }
  const { userId } = first.member;
  expect(await accessTo(userId, PROD)).toEqual({ level: 'write' });

  await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('cy'),
    role: 'viewer',
    projectScope: 'selected',
    projects: [{ projectId: DEV, level: 'read' }],
  });

  expect(await accessTo(userId, PROD)).toBeNull();
  expect(await accessTo(userId, DEV)).toEqual({ level: 'read' });
});

test('removing a member revokes the cached access at once', async () => {
  const put = await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('dee'),
    role: 'admin',
    projectScope: 'all',
    projects: [],
  });
  if (!put.ok) {
    throw new Error(`put refused: ${put.reason}`);
  }
  const { userId } = put.member;
  expect(await accessTo(userId, DEV)).not.toBeNull();
  expect(
    await lookups.getOrganizationAccess({ userId, organizationId: ORG_ID })
  ).not.toBeNull();

  expect(
    await subject.removeManagedMember(deps, {
      organizationId: ORG_ID,
      email: email('dee'),
    })
  ).toEqual({ ok: true });

  expect(await accessTo(userId, DEV)).toBeNull();
  expect(
    await lookups.getOrganizationAccess({ userId, organizationId: ORG_ID })
  ).toBeNull();
});

test('a password user gets a verified email so single sign-on can link it', async () => {
  const user = await deps.db.user.create({
    data: { email: email('legacy'), emailVerified: false },
  });

  await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('legacy'),
    role: 'viewer',
    projectScope: 'all',
    projects: [],
  });

  const after = await deps.db.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  expect(after.emailVerified).toBe(true);
  expect(await accessTo(user.id, PROD)).toEqual({ level: 'read' });
});

test('the owner is never changed or removed', async () => {
  expect(
    await subject.putManagedMember(deps, {
      organizationId: ORG_ID,
      email: OWNER_EMAIL,
      role: 'viewer',
      projectScope: 'selected',
      projects: [],
    })
  ).toEqual({ ok: false, reason: 'owner' });
  expect(
    await subject.removeManagedMember(deps, {
      organizationId: ORG_ID,
      email: OWNER_EMAIL,
    })
  ).toEqual({ ok: false, reason: 'owner' });
  const owner = await deps.db.member.findFirstOrThrow({
    where: { organizationId: ORG_ID, userId: OWNER_ID },
  });
  expect(owner.role).toBe('owner');
  expect(owner.projectScope).toBe('all');
});

test("a grant on another organization's project is refused and writes nothing", async () => {
  const result = await subject.putManagedMember(deps, {
    organizationId: ORG_ID,
    email: email('eve'),
    role: 'member',
    projectScope: 'selected',
    projects: [{ projectId: FOREIGN, level: 'write' }],
  });

  expect(result).toEqual({
    ok: false,
    reason: 'unknown_projects',
    projectIds: [FOREIGN],
  });
  expect(
    await deps.db.user.findUnique({ where: { email: email('eve') } })
  ).toBeNull();
});

test('removing someone who is not a member reports not found', async () => {
  expect(
    await subject.removeManagedMember(deps, {
      organizationId: ORG_ID,
      email: email('nobody'),
    })
  ).toEqual({ ok: false, reason: 'not_found' });
});

test('the list shows each member once, by email, with read and write grants', async () => {
  const members = await subject.listManagedMembers(deps, ORG_ID);
  const bob = members.find((member) => member.email === email('bob'));

  expect(bob).toMatchObject({
    role: 'member',
    projectScope: 'selected',
    projects: expect.arrayContaining([
      { projectId: PROD, level: 'write' },
      { projectId: DEV, level: 'read' },
    ]),
  });
  expect(new Set(members.map((member) => member.email)).size).toBe(
    members.length
  );
});
