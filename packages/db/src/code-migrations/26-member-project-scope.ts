import { db } from '../prisma-client';
import { getIsDry, printBoxMessage, shortId, slugify } from './helpers';

/**
 * Give every member an explicit project scope.
 *
 * Before: a member with no `project_access` rows could reach every project,
 * one with rows only those. After: `members.projectScope` says which, and
 * `member_projects` lists the selected ones. Nothing is implied by absence.
 *
 * `project_access` is left in place and kept in sync by the app for one more
 * build, so the previous image keeps working during the rolling deploy and
 * a rollback needs no data change.
 *
 * Idempotent: scope is only ever moved towards `selected` where rows exist,
 * and rows are inserted with ON CONFLICT DO NOTHING, so a rerun converges on
 * the same state. Members already set to `selected` with no rows (restricted
 * to nothing by the new UI) are not touched.
 *
 * Levels: `read` was a deliberate restriction and is kept. `write` and `admin`
 * were the unenforced defaults, so they become NULL and derive from the role.
 *
 * Pending invites got the column default `all`; one with grants was
 * restricted and becomes `selected`. `project_access` rows with no membership
 * are reported and left alone: they never granted access, so making them
 * memberships would.
 */

const SLUG_SUFFIX_ATTEMPTS = 5;

interface Count {
  count: bigint;
}

async function countMembersToScope(): Promise<number> {
  const rows = await db.$queryRaw<Count[]>`
    SELECT COUNT(*) AS count
    FROM members m
    WHERE m."projectScope" = 'all'
      AND EXISTS (
        SELECT 1 FROM project_access pa
        WHERE pa."userId" = m."userId"
          AND pa."organizationId" = m."organizationId"
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

// Not async: `$transaction([...])` needs the PrismaPromise itself.
function scopeMembers() {
  return db.$executeRaw`
    UPDATE members m
    SET "projectScope" = 'selected'
    WHERE m."projectScope" = 'all'
      AND EXISTS (
        SELECT 1 FROM project_access pa
        WHERE pa."userId" = m."userId"
          AND pa."organizationId" = m."organizationId"
      )
  `;
}

function copyGrants() {
  return db.$executeRaw`
    INSERT INTO member_projects ("memberId", "projectId", "level")
    SELECT m.id, pa."projectId",
      CASE WHEN bool_or(pa.level = 'read') THEN 'read'::"AccessLevel" END
    FROM project_access pa
    JOIN members m
      ON m."userId" = pa."userId"
     AND m."organizationId" = pa."organizationId"
    -- project_access has no unique key; a read row among duplicates wins.
    GROUP BY m.id, pa."projectId"
    ON CONFLICT DO NOTHING
  `;
}

async function countInvitesToScope(): Promise<number> {
  const rows = await db.$queryRaw<Count[]>`
    SELECT COUNT(*) AS count FROM invites
    WHERE "projectScope" = 'all' AND jsonb_array_length("projectAccess") > 0
  `;
  return Number(rows[0]?.count ?? 0);
}

function scopeInvites() {
  return db.$executeRaw`
    UPDATE invites
    SET "projectScope" = 'selected'
    WHERE "projectScope" = 'all'
      AND jsonb_array_length("projectAccess") > 0
  `;
}

async function countGrantsWithoutMembership(): Promise<number> {
  const rows = await db.$queryRaw<Count[]>`
    SELECT COUNT(*) AS count
    FROM project_access pa
    WHERE NOT EXISTS (
      SELECT 1 FROM members m
      WHERE m."userId" = pa."userId"
        AND m."organizationId" = pa."organizationId"
    )
  `;
  return Number(rows[0]?.count ?? 0);
}

async function backfillSlugs(isDry: boolean): Promise<number> {
  const organizations = await db.organization.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });

  if (isDry) {
    return organizations.length;
  }

  for (const organization of organizations) {
    const base = slugify(organization.name) || 'organization';
    let attempt = 0;
    while (attempt < SLUG_SUFFIX_ATTEMPTS) {
      attempt += 1;
      try {
        await db.organization.update({
          where: { id: organization.id },
          data: { slug: `${base}-${shortId().toLowerCase()}` },
        });
        break;
      } catch (error) {
        if (attempt === SLUG_SUFFIX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  return organizations.length;
}

export async function up() {
  const isDry = getIsDry();

  const [membersToScope, grantsToCopy, invitesToScope, orphanGrants] =
    await Promise.all([
      countMembersToScope(),
      db.projectAccess.count(),
      countInvitesToScope(),
      countGrantsWithoutMembership(),
    ]);
  const orphanLine = `project_access rows without a membership, left as is: ${orphanGrants}`;

  if (isDry) {
    const slugs = await backfillSlugs(true);
    printBoxMessage('🧪 Dry run: member project scope', [
      `Members to set to "selected": ${membersToScope}`,
      `project_access rows to copy: ${grantsToCopy}`,
      `Pending invites to set to "selected": ${invitesToScope}`,
      orphanLine,
      `Organizations without a slug: ${slugs}`,
    ]);
    return;
  }

  const [scoped, copied, invitesScoped] = await db.$transaction([
    scopeMembers(),
    copyGrants(),
    scopeInvites(),
  ]);
  const slugs = await backfillSlugs(false);

  printBoxMessage('✅ Member project scope', [
    `Members set to "selected": ${scoped}`,
    `member_projects rows inserted: ${copied} (of ${grantsToCopy} grants)`,
    `Pending invites set to "selected": ${invitesScoped}`,
    orphanLine,
    `Organization slugs set: ${slugs}`,
  ]);
}
