import { db } from '../prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

/**
 * Prepares users for signing in through better-auth.
 *
 * - Emails are lowercased: better-auth lowercases every address it looks up,
 *   so a stored `Ada@x.com` could no longer sign in. Two users whose emails
 *   differ only in case are left alone and listed; they are fixed by hand.
 * - Users with a Google, GitHub or bulk-imported `oauth` account are marked
 *   email verified. better-auth links a Google/GitHub sign-in to an existing
 *   user by email only when that user is verified, which is how the imported
 *   `oauth` users and the accounts without an IdP id get their account.
 * - Roles are renamed again (`org:admin` → `admin`, `org:member` → `member`,
 *   the creator's admin membership → `owner`): servers from before migration
 *   29 kept writing the old names during that rollout.
 *
 * Idempotent: every statement only touches rows still in the old shape.
 */

interface Count {
  count: bigint;
}

interface CaseCollision {
  email: string;
  userIds: string[];
}

const LEGACY_ROLES = ['org:admin', 'org:member'];
const LINKABLE_PROVIDERS = ['google', 'github', 'oauth'];

function toNumber(rows: Count[]): number {
  return Number(rows[0]?.count ?? 0);
}

function findCaseCollisions() {
  return db.$queryRaw<CaseCollision[]>`
    SELECT lower(email) AS email, array_agg(id ORDER BY "createdAt") AS "userIds"
    FROM users
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  `;
}

async function countPending() {
  const [emails, verified, roles, owners] = await Promise.all([
    db.$queryRaw<Count[]>`
      SELECT COUNT(*) AS count FROM users u
      WHERE u.email <> lower(u.email) AND NOT EXISTS (
        SELECT 1 FROM users o WHERE o.id <> u.id AND lower(o.email) = lower(u.email)
      )
    `.then(toNumber),
    db.$queryRaw<Count[]>`
      SELECT COUNT(*) AS count FROM users u
      WHERE NOT u."emailVerified" AND EXISTS (
        SELECT 1 FROM accounts a
        WHERE a."userId" = u.id AND a.provider = ANY(${LINKABLE_PROVIDERS})
      )
    `.then(toNumber),
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
  return { emails, verified, roles, owners };
}

function lowercaseEmails() {
  return db.$executeRaw`
    UPDATE users u
    SET email = lower(u.email)
    WHERE u.email <> lower(u.email) AND NOT EXISTS (
      SELECT 1 FROM users o WHERE o.id <> u.id AND lower(o.email) = lower(u.email)
    )
  `;
}

function markLinkableEmailsVerified() {
  return db.$executeRaw`
    UPDATE users u
    SET "emailVerified" = true
    WHERE NOT u."emailVerified" AND EXISTS (
      SELECT 1 FROM accounts a
      WHERE a."userId" = u.id AND a.provider = ANY(${LINKABLE_PROVIDERS})
    )
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

function describeCollisions(collisions: CaseCollision[]): string[] {
  return collisions.map(
    (collision) => `  ${collision.email}: ${collision.userIds.join(', ')}`
  );
}

export async function up() {
  const [pending, collisions] = await Promise.all([
    countPending(),
    findCaseCollisions(),
  ]);

  if (getIsDry()) {
    printBoxMessage('🧪 Dry run: better-auth sign-in', [
      `Emails to lowercase: ${pending.emails}`,
      `Users to mark email verified: ${pending.verified}`,
      `Members and invites with a legacy role name: ${pending.roles}`,
      `Creator memberships to make owner: ${pending.owners}`,
      `Emails shared by users that differ only in case: ${collisions.length}`,
      ...describeCollisions(collisions),
    ]);
    return;
  }

  const [emails, verified, memberRoles, inviteRoles, owners] =
    await db.$transaction([
      lowercaseEmails(),
      markLinkableEmailsVerified(),
      renameMemberRoles(),
      renameInviteRoles(),
      promoteCreatorsToOwner(),
    ]);

  printBoxMessage('✅ better-auth sign-in', [
    `Emails lowercased: ${emails}`,
    `Users marked email verified: ${verified}`,
    `Roles renamed: ${memberRoles} members, ${inviteRoles} invites`,
    `Creator memberships made owner: ${owners}`,
    `Left for a manual fix, emails that differ only in case: ${collisions.length}`,
    ...describeCollisions(collisions),
  ]);
}
