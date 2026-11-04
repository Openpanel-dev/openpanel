import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { db } from '../prisma-client';
import { up } from './29-better-auth-backfill';

const PREFIX = 'm29';
const ORG_ID = `${PREFIX}-org`;
const OTHER_ORG_ID = `${PREFIX}-other-org`;

const id = (name: string) => `${PREFIX}-${name}`;
const OLDER = new Date('2024-01-01T00:00:00Z');
const NEWER = new Date('2024-06-01T00:00:00Z');

async function cleanUp() {
  await db.organization.deleteMany({
    where: { id: { in: [ORG_ID, OTHER_ORG_ID] } },
  });
  await db.user.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
}

async function seed() {
  await db.user.createMany({
    data: [
      {
        id: id('creator'),
        email: 'm29-creator@test',
        firstName: ' Ada ',
        lastName: 'Lovelace ',
      },
      {
        id: id('admin'),
        email: 'm29-admin@test',
        firstName: 'Grace',
        lastName: null,
      },
      {
        id: id('member'),
        email: 'm29-member@test',
        firstName: null,
        lastName: null,
      },
      {
        id: id('demoted-creator'),
        email: 'm29-demoted@test',
        firstName: '',
        lastName: 'Hopper',
      },
      { id: id('github'), email: 'm29-github@test' },
      { id: id('google-dup'), email: 'm29-google-dup@test' },
      { id: id('imported'), email: 'm29-imported@test' },
      { id: id('shared-a'), email: 'm29-shared-a@test' },
      { id: id('shared-b'), email: 'm29-shared-b@test' },
    ],
  });
  await db.account.createMany({
    data: [
      {
        id: id('acc-email'),
        userId: id('creator'),
        provider: 'email',
        password: 'hash',
      },
      {
        id: id('acc-google'),
        userId: id('admin'),
        provider: 'google',
        providerId: 'g-1',
      },
      {
        id: id('acc-github'),
        userId: id('github'),
        provider: 'github',
        providerId: 'gh-1',
        createdAt: OLDER,
      },
      {
        id: id('acc-github-dup'),
        userId: id('github'),
        provider: 'github',
        providerId: 'gh-1',
        createdAt: NEWER,
      },
      {
        id: id('acc-google-no-email'),
        userId: id('google-dup'),
        provider: 'google',
        providerId: 'g-dup',
        createdAt: OLDER,
      },
      {
        id: id('acc-google-with-email'),
        userId: id('google-dup'),
        provider: 'google',
        providerId: 'g-dup',
        email: 'm29-google-dup@test',
        createdAt: NEWER,
      },
      { id: id('acc-oauth'), userId: id('imported'), provider: 'oauth' },
      {
        id: id('acc-github-no-id'),
        userId: id('member'),
        provider: 'github',
        email: 'm29-member@test',
      },
      {
        id: id('acc-shared-a'),
        userId: id('shared-a'),
        provider: 'github',
        providerId: 'gh-shared',
      },
      {
        id: id('acc-shared-b'),
        userId: id('shared-b'),
        provider: 'github',
        providerId: 'gh-shared',
      },
    ],
  });
  await db.organization.create({
    data: { id: ORG_ID, name: 'M29', createdByUserId: id('creator') },
  });
  await db.organization.create({
    data: {
      id: OTHER_ORG_ID,
      name: 'M29 other',
      createdByUserId: id('demoted-creator'),
    },
  });
  await db.member.createMany({
    data: [
      {
        organizationId: ORG_ID,
        userId: id('creator'),
        email: 'm29-creator@test',
        role: 'org:admin',
      },
      {
        organizationId: ORG_ID,
        userId: id('admin'),
        email: 'm29-admin@test',
        role: 'org:admin',
      },
      {
        organizationId: ORG_ID,
        userId: id('member'),
        email: 'm29-member@test',
        role: 'org:member',
      },
      {
        organizationId: OTHER_ORG_ID,
        userId: id('demoted-creator'),
        email: 'm29-demoted@test',
        role: 'org:member',
      },
    ],
  });
  await db.invite.create({
    data: {
      id: id('invite'),
      email: 'm29-invitee@test',
      organizationId: ORG_ID,
      createdById: id('creator'),
      role: 'org:admin',
      expiresAt: NEWER,
    },
  });
}

async function snapshot() {
  const [users, accounts, members, invite] = await Promise.all([
    db.user.findMany({
      where: { id: { startsWith: `${PREFIX}-` } },
      select: { id: true, name: true, emailVerified: true },
      orderBy: { id: 'asc' },
    }),
    db.account.findMany({
      where: { id: { startsWith: `${PREFIX}-` } },
      select: { id: true, provider: true, providerId: true, accountId: true },
      orderBy: { id: 'asc' },
    }),
    db.member.findMany({
      where: { organizationId: { in: [ORG_ID, OTHER_ORG_ID] } },
      select: { userId: true, role: true },
      orderBy: { userId: 'asc' },
    }),
    db.invite.findUniqueOrThrow({
      where: { id: id('invite') },
      select: { role: true },
    }),
  ]);
  return {
    users: Object.fromEntries(users.map((user) => [user.id, user])),
    accounts: Object.fromEntries(
      accounts.map((account) => [account.id, account])
    ),
    roles: Object.fromEntries(
      members.map((member) => [member.userId, member.role])
    ),
    inviteRole: invite.role,
  };
}

describe('29-better-auth-backfill', () => {
  let after: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    await cleanUp();
    await seed();
    await up();
    after = await snapshot();
  });

  afterAll(cleanUp);

  it('joins and trims names, leaving an empty name when there is none', () => {
    expect(after.users[id('creator')]?.name).toBe('Ada Lovelace');
    expect(after.users[id('admin')]?.name).toBe('Grace');
    expect(after.users[id('demoted-creator')]?.name).toBe('Hopper');
    expect(after.users[id('member')]?.name).toBe('');
  });

  it('marks email verified only for users with a Google or GitHub account', () => {
    expect(after.users[id('admin')]?.emailVerified).toBe(true);
    expect(after.users[id('github')]?.emailVerified).toBe(true);
    expect(after.users[id('member')]?.emailVerified).toBe(true);
    expect(after.users[id('creator')]?.emailVerified).toBe(false);
    expect(after.users[id('imported')]?.emailVerified).toBe(false);
  });

  it('turns email accounts into credential accounts keyed by the user id', () => {
    expect(after.accounts[id('acc-email')]).toMatchObject({
      provider: 'credential',
      accountId: id('creator'),
    });
  });

  it('copies the IdP id into accountId for Google and GitHub', () => {
    expect(after.accounts[id('acc-google')]?.accountId).toBe('g-1');
    expect(after.accounts[id('acc-github')]?.accountId).toBe('gh-1');
  });

  it('leaves accounts without an IdP id for the next sign-in', () => {
    expect(after.accounts[id('acc-oauth')]).toMatchObject({
      provider: 'oauth',
      accountId: null,
    });
    expect(after.accounts[id('acc-github-no-id')]?.accountId).toBeNull();
  });

  it("keeps the oldest of a user's duplicate accounts", () => {
    expect(after.accounts[id('acc-github')]).toBeDefined();
    expect(after.accounts[id('acc-github-dup')]).toBeUndefined();
  });

  it('prefers the duplicate that has an email over the oldest', () => {
    expect(after.accounts[id('acc-google-with-email')]?.accountId).toBe(
      'g-dup'
    );
    expect(after.accounts[id('acc-google-no-email')]).toBeUndefined();
  });

  it('keeps one IdP id shared by two users on both', () => {
    expect(after.accounts[id('acc-shared-a')]?.accountId).toBe('gh-shared');
    expect(after.accounts[id('acc-shared-b')]?.accountId).toBe('gh-shared');
  });

  it("renames roles and makes the creator's admin membership owner", () => {
    expect(after.roles).toEqual({
      [id('admin')]: 'admin',
      [id('creator')]: 'owner',
      [id('demoted-creator')]: 'member',
      [id('member')]: 'member',
    });
    expect(after.inviteRole).toBe('admin');
  });

  it('changes nothing when run again', async () => {
    await up();
    expect(await snapshot()).toEqual(after);
  });
});
