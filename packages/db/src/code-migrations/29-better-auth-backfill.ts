import { db } from '../prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

/**
 * Fill the columns better-auth reads, and store roles under their new names.
 *
 * - `users.name` from first and last name, trimmed; empty when both are.
 * - `users.emailVerified` for users with a Google or GitHub account: the IdP
 *   verified the address. Everyone else stays unverified, which locks nobody
 *   out because email verification is not required.
 * - Email accounts become better-auth's `credential` accounts, whose
 *   `accountId` is the user id. Google and GitHub accounts get `accountId`
 *   from `providerId`. Rows without a `providerId` (the bulk-imported `oauth`
 *   ones and a few Google/GitHub ones) have nothing to copy and are left for
 *   the next sign-in to resolve.
 * - Duplicate accounts for the same user, provider and IdP id (a December
 *   2024 import that ran twice) are collapsed into one: the copy with an
 *   email, else the oldest. The same IdP id on two users is left alone.
 * - Roles: `org:admin` → `admin`, `org:member` → `member` on members and
 *   pending invites, then the organization creator's admin membership →
 *   `owner`, which is what the previous build derived at read time.
 *
 * Idempotent: every statement only touches rows still in the old shape.
 */

interface Count {
  count: bigint;
}

const LEGACY_ROLES = ['org:admin', 'org:member'];
const VERIFYING_PROVIDERS = ['google', 'github'];

function toNumber(rows: Count[]): number {
  return Number(rows[0]?.count ?? 0);
}

async function countPending() {
  const [names, verified, duplicates, credentials, oauthIds, roles, owners] =
    await Promise.all([
      db.user.count({ where: { name: null } }),
      db.$queryRaw<Count[]>`
        SELECT COUNT(*) AS count FROM users u
        WHERE NOT u."emailVerified" AND EXISTS (
          SELECT 1 FROM accounts a
          WHERE a."userId" = u.id AND a.provider = ANY(${VERIFYING_PROVIDERS})
        )
      `.then(toNumber),
      db.$queryRaw<Count[]>`
        SELECT COUNT(*) AS count FROM accounts a
        WHERE a."providerId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM accounts b
          WHERE b."userId" = a."userId"
            AND b.provider = a.provider
            AND b."providerId" = a."providerId"
            AND (b.email IS NULL, b."createdAt", b.id) < (a.email IS NULL, a."createdAt", a.id)
        )
      `.then(toNumber),
      db.account.count({ where: { provider: 'email' } }),
      db.account.count({
        where: {
          provider: { in: VERIFYING_PROVIDERS },
          providerId: { not: null },
          accountId: null,
        },
      }),
      Promise.all([
        db.member.count({ where: { role: { in: LEGACY_ROLES } } }),
        db.invite.count({ where: { role: { in: LEGACY_ROLES } } }),
      ]).then(([members, invites]) => members + invites),
      db.$queryRaw<Count[]>`
        SELECT COUNT(*) AS count FROM members m
        JOIN organizations o ON o.id = m."organizationId"
        WHERE m."userId" = o."createdByUserId"
          AND m.role IN ('admin', 'org:admin')
      `.then(toNumber),
    ]);
  return {
    names,
    verified,
    duplicates,
    credentials,
    oauthIds,
    roles,
    owners,
  };
}

function backfillNames() {
  return db.$executeRaw`
    UPDATE users
    SET name = btrim(concat_ws(' ', btrim("firstName"), btrim("lastName")))
    WHERE name IS NULL
  `;
}

function markIdpVerifiedEmails() {
  return db.$executeRaw`
    UPDATE users u
    SET "emailVerified" = true
    WHERE NOT u."emailVerified" AND EXISTS (
      SELECT 1 FROM accounts a
      WHERE a."userId" = u.id AND a.provider = ANY(${VERIFYING_PROVIDERS})
    )
  `;
}

function collapseDuplicateAccounts() {
  return db.$executeRaw`
    DELETE FROM accounts a
    USING accounts b
    WHERE a."providerId" IS NOT NULL
      AND b."userId" = a."userId"
      AND b.provider = a.provider
      AND b."providerId" = a."providerId"
      AND (b.email IS NULL, b."createdAt", b.id) < (a.email IS NULL, a."createdAt", a.id)
  `;
}

function toCredentialAccounts() {
  return db.$executeRaw`
    UPDATE accounts
    SET provider = 'credential', "accountId" = "userId"
    WHERE provider = 'email'
  `;
}

function copyOAuthAccountIds() {
  return db.$executeRaw`
    UPDATE accounts
    SET "accountId" = "providerId"
    WHERE provider = ANY(${VERIFYING_PROVIDERS})
      AND "providerId" IS NOT NULL
      AND "accountId" IS NULL
  `;
}

function renameMemberRoles() {
  return db.$executeRaw`
    UPDATE members
    SET role = CASE role WHEN 'org:admin' THEN 'admin' ELSE 'member' END
    WHERE role = ANY(${LEGACY_ROLES})
  `;
}

function renameInviteRoles() {
  return db.$executeRaw`
    UPDATE invites
    SET role = CASE role WHEN 'org:admin' THEN 'admin' ELSE 'member' END
    WHERE role = ANY(${LEGACY_ROLES})
  `;
}

function promoteCreatorsToOwner() {
  return db.$executeRaw`
    UPDATE members m
    SET role = 'owner'
    FROM organizations o
    WHERE o.id = m."organizationId"
      AND m."userId" = o."createdByUserId"
      AND m.role = 'admin'
  `;
}

export async function up() {
  const pending = await countPending();

  if (getIsDry()) {
    printBoxMessage('🧪 Dry run: better-auth backfill', [
      `Users to get a name: ${pending.names}`,
      `Users to mark email verified: ${pending.verified}`,
      `Duplicate accounts to remove: ${pending.duplicates}`,
      `Email accounts to turn into credential accounts: ${pending.credentials}`,
      `Google/GitHub accounts to get an accountId: ${pending.oauthIds}`,
      `Members and invites with a legacy role name: ${pending.roles}`,
      `Creator memberships to make owner: ${pending.owners}`,
    ]);
    return;
  }

  const [
    names,
    verified,
    duplicates,
    credentials,
    oauthIds,
    memberRoles,
    inviteRoles,
    owners,
  ] = await db.$transaction([
    backfillNames(),
    markIdpVerifiedEmails(),
    collapseDuplicateAccounts(),
    toCredentialAccounts(),
    copyOAuthAccountIds(),
    renameMemberRoles(),
    renameInviteRoles(),
    promoteCreatorsToOwner(),
  ]);

  printBoxMessage('✅ better-auth backfill', [
    `Users given a name: ${names}`,
    `Users marked email verified: ${verified}`,
    `Duplicate accounts removed: ${duplicates}`,
    `Credential accounts: ${credentials}`,
    `Google/GitHub accounts given an accountId: ${oauthIds}`,
    `Roles renamed: ${memberRoles} members, ${inviteRoles} invites`,
    `Creator memberships made owner: ${owners}`,
  ]);
}
