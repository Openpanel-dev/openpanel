import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { db } from '../prisma-client';
import { up } from './30-better-auth-sign-in';

const PREFIX = 'm30';
const ORG_ID = `${PREFIX}-org`;

const id = (name: string) => `${PREFIX}-${name}`;

async function cleanUp() {
  await db.organization.deleteMany({ where: { id: ORG_ID } });
  await db.user.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
}

async function seed() {
  await db.user.createMany({
    data: [
      { id: id('creator'), email: 'm30-creator@test' },
      { id: id('mixed'), email: 'M30-Mixed@Test' },
      { id: id('pair-google'), email: 'M30-Pair@test' },
      { id: id('pair-github'), email: 'm30-pair@test' },
      { id: id('imported'), email: 'm30-imported@test' },
      { id: id('github-no-id'), email: 'm30-github-no-id@test' },
      { id: id('password'), email: 'm30-password@test' },
    ],
  });
  await db.account.createMany({
    data: [
      { userId: id('imported'), provider: 'oauth' },
      { userId: id('github-no-id'), provider: 'github' },
      { userId: id('password'), provider: 'credential', password: 'hash' },
    ],
  });
  await db.organization.create({
    data: { id: ORG_ID, name: 'M30', createdByUserId: id('creator') },
  });
  await db.member.createMany({
    data: [
      {
        organizationId: ORG_ID,
        userId: id('creator'),
        email: 'm30-creator@test',
        role: 'org:admin',
      },
      {
        organizationId: ORG_ID,
        userId: id('mixed'),
        email: 'm30-mixed@test',
        role: 'org:member',
      },
    ],
  });
  await db.invite.create({
    data: {
      id: id('invite'),
      email: 'm30-invitee@test',
      organizationId: ORG_ID,
      createdById: id('creator'),
      role: 'org:member',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    },
  });
}

async function snapshot() {
  const [users, members, invite] = await Promise.all([
    db.user.findMany({
      where: { id: { startsWith: `${PREFIX}-` } },
      select: { id: true, email: true, emailVerified: true },
      orderBy: { id: 'asc' },
    }),
    db.member.findMany({
      where: { organizationId: ORG_ID },
      select: { userId: true, role: true },
    }),
    db.invite.findUniqueOrThrow({
      where: { id: id('invite') },
      select: { role: true },
    }),
  ]);
  return {
    users: Object.fromEntries(users.map((user) => [user.id, user])),
    roles: Object.fromEntries(
      members.map((member) => [member.userId, member.role])
    ),
    inviteRole: invite.role,
  };
}

describe('30-better-auth-sign-in', () => {
  let after: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    await cleanUp();
    await seed();
    await up();
    after = await snapshot();
  });

  afterAll(cleanUp);

  it('lowercases emails', () => {
    expect(after.users[id('mixed')]?.email).toBe('m30-mixed@test');
  });

  it('leaves two users whose emails differ only in case untouched', () => {
    expect(after.users[id('pair-google')]?.email).toBe('M30-Pair@test');
    expect(after.users[id('pair-github')]?.email).toBe('m30-pair@test');
  });

  it('marks users with an OAuth account verified, including imported ones', () => {
    expect(after.users[id('imported')]?.emailVerified).toBe(true);
    expect(after.users[id('github-no-id')]?.emailVerified).toBe(true);
    expect(after.users[id('password')]?.emailVerified).toBe(false);
  });

  it('renames roles written by older servers', () => {
    expect(after.roles).toEqual({
      [id('creator')]: 'owner',
      [id('mixed')]: 'member',
    });
    expect(after.inviteRole).toBe('member');
  });

  it('changes nothing when run again', async () => {
    await up();
    expect(await snapshot()).toEqual(after);
  });
});
