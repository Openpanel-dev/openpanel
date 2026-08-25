import { zProjectAccessGrant } from '@openpanel/validation';
import { db } from '../index';
import { getIsDry, printBoxMessage } from './helpers';

/**
 * Convert pending invites from a text[] of project ids to [{ projectId, level }].
 *
 * Prisma migration 20260825120100 does the DDL only: it parks the old values in
 * `projectAccess_legacy` and adds the new jsonb `projectAccess`. This step does
 * the data, then drops the legacy column.
 *
 * The split exists because `pnpm migrate:deploy` runs `prisma migrate deploy`
 * before `migrate:deploy:code` - anything the SQL migration dropped would be
 * gone before this file ran. Doing it here buys per-row validation against
 * zProjectAccessGrant, a report of grants that can no longer resolve, and
 * `--dry`.
 *
 * Level: every pending invite predates the level selector, so 'write' is the
 * only value that preserves meaning - connectUserToOrganization hardcoded
 * 'write' when it created the ProjectAccess rows on accept. No pending invite
 * changes what it grants.
 *
 * Orphaned grants are reported, never dropped. A grant whose project no longer
 * exists (or belongs to another org) would fail the ProjectAccess FK when the
 * invite is accepted - but it was equally broken before this migration, so
 * silently discarding it here would be a behavior change hidden inside a data
 * conversion. Act on the reported invite ids by hand, or just let them lapse:
 * invites expire 3 days after they are created.
 *
 * Idempotent: no-ops once the legacy column is gone, and skips any invite that
 * already carries new-format grants, so an invite created by new code in the
 * window between the two migration steps is never clobbered.
 */

const LEGACY_COLUMN = 'projectAccess_legacy';

// The level accepting one of these invites would have produced anyway.
const IMPLIED_LEVEL = 'write' as const;

type LegacyInvite = {
  id: string;
  email: string;
  organizationId: string;
  legacy: string[] | null;
  convertedCount: number;
};

async function hasLegacyColumn(): Promise<boolean> {
  const rows = await db.$queryRaw<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'invites'
        AND column_name = ${LEGACY_COLUMN}
    ) AS present
  `;

  return rows[0]?.present === true;
}

export async function up() {
  if (!(await hasLegacyColumn())) {
    printBoxMessage('✅ Invites already migrated', [
      `invites."${LEGACY_COLUMN}" is gone - nothing to convert.`,
    ]);
    return;
  }

  const isDry = getIsDry();

  const invites = await db.$queryRaw<LegacyInvite[]>`
    SELECT
      id,
      email,
      "organizationId",
      -- Written out rather than interpolated: $queryRaw binds an interpolated
      -- slot as a value, which is not valid for a column identifier.
      -- Keep in sync with LEGACY_COLUMN.
      "projectAccess_legacy" AS legacy,
      jsonb_array_length("projectAccess") AS "convertedCount"
    FROM invites
    ORDER BY "createdAt"
  `;

  // One read of every project so an orphaned grant is a map lookup rather than
  // a query per invite.
  const projects = await db.project.findMany({
    select: { id: true, organizationId: true },
  });
  const organizationByProject = new Map(
    projects.map((project) => [project.id, project.organizationId]),
  );

  const skipped: string[] = [];
  const orphans: string[] = [];
  const converted: { id: string; grants: unknown[] }[] = [];

  for (const invite of invites) {
    // Written by new code between the two migration steps - its grants are
    // already authoritative, and the legacy column for that row is just the
    // column default.
    if (invite.convertedCount > 0) {
      skipped.push(`${invite.id} (${invite.email}) - already in new format`);
      continue;
    }

    const projectIds = [...new Set(invite.legacy ?? [])].filter(Boolean);

    for (const projectId of projectIds) {
      const owner = organizationByProject.get(projectId);

      if (owner === undefined) {
        orphans.push(
          `${invite.id} (${invite.email}) -> ${projectId} - project does not exist`,
        );
      } else if (owner !== invite.organizationId) {
        orphans.push(
          `${invite.id} (${invite.email}) -> ${projectId} - belongs to ${owner}, invite is for ${invite.organizationId}`,
        );
      }
    }

    // Parse rather than hand-build: if zProjectAccessGrant ever gains a field
    // this throws instead of writing a shape the app cannot read.
    const grants = projectIds.map((projectId) =>
      zProjectAccessGrant.parse({ projectId, level: IMPLIED_LEVEL }),
    );

    converted.push({ id: invite.id, grants });
  }

  printBoxMessage('📋 Plan', [
    `Invites found:      ${invites.length}`,
    `Will convert:       ${converted.length}`,
    `Already converted:  ${skipped.length}`,
    `Grants to write:    ${converted.reduce((sum, i) => sum + i.grants.length, 0)}`,
    `Unresolvable:       ${orphans.length}`,
  ]);

  if (orphans.length > 0) {
    printBoxMessage('⚠️  Grants that will not resolve on accept', [
      ...orphans,
      '',
      'Kept as-is. These were already broken before this migration; accepting',
      'such an invite fails the project_access FK. Fix or delete the invite by',
      'hand, or let it expire (invites lapse 3 days after creation).',
    ]);
  }

  if (isDry) {
    printBoxMessage('🕒 Dry run - nothing written', [
      `Would convert ${converted.length} invite(s)`,
      `Would drop invites."${LEGACY_COLUMN}"`,
    ]);
    return;
  }

  for (const invite of converted) {
    await db.$executeRaw`
      UPDATE invites
      SET "projectAccess" = ${JSON.stringify(invite.grants)}::jsonb
      WHERE id = ${invite.id}
    `;
  }

  await db.$executeRawUnsafe(
    `ALTER TABLE "invites" DROP COLUMN "${LEGACY_COLUMN}"`,
  );

  printBoxMessage('✅ Migration Complete', [
    `Converted: ${converted.length} invite(s)`,
    `Skipped:   ${skipped.length} (already in new format)`,
    `Dropped:   invites."${LEGACY_COLUMN}"`,
  ]);
}
