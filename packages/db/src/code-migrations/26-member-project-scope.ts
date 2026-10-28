import { db } from '../prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

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
 * Pending invites are converted by the Prisma migration
 * `invite_project_scope_backfill`, before the api can accept one.
 * `project_access` rows with no membership are reported and left alone: they
 * never granted access, so making them memberships would.
 *
 * An install that upgrades past the next build gets `project_access` folded in
 * and dropped by that build's Prisma migration before this runs, so only the
 * slug step is left to do.
 */

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

async function hasProjectAccessTable(): Promise<boolean> {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public.project_access') IS NOT NULL AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function countGrants(): Promise<number> {
  const rows = await db.$queryRaw<Count[]>`
    SELECT COUNT(*) AS count FROM project_access
  `;
  return Number(rows[0]?.count ?? 0);
}

async function countOrganizationsWithoutSlug(): Promise<number> {
  return db.organization.count({ where: { slug: null } });
}

// A slug equal to the id can never collide with another organization's;
// new organizations get the same.
function backfillSlugs() {
  return db.$executeRaw`UPDATE organizations SET slug = id WHERE slug IS NULL`;
}

export async function up() {
  const isDry = getIsDry();
  const hasGrants = await hasProjectAccessTable();

  const [membersToScope, grantsToCopy, orphanGrants] = await Promise.all([
    hasGrants ? countMembersToScope() : 0,
    hasGrants ? countGrants() : 0,
    hasGrants ? countGrantsWithoutMembership() : 0,
  ]);
  const orphanLine = `project_access rows without a membership, left as is: ${orphanGrants}`;

  if (isDry) {
    const slugs = await countOrganizationsWithoutSlug();
    printBoxMessage('🧪 Dry run: member project scope', [
      `Members to set to "selected": ${membersToScope}`,
      `project_access rows to copy: ${grantsToCopy}`,
      orphanLine,
      `Organizations without a slug: ${slugs}`,
    ]);
    return;
  }

  const [scoped, copied] = hasGrants
    ? await db.$transaction([scopeMembers(), copyGrants()])
    : [0, 0];
  const slugs = await backfillSlugs();

  printBoxMessage('✅ Member project scope', [
    `Members set to "selected": ${scoped}`,
    `member_projects rows inserted: ${copied} (of ${grantsToCopy} grants)`,
    orphanLine,
    `Organization slugs set: ${slugs}`,
  ]);
}
