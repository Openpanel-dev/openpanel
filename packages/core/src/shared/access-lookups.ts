// The concrete, Prisma-backed access lookups (M8-005, moved from
// packages/db/src/services/access.service.ts). Deliberately a sibling of
// shared/access.ts rather than living inside it: the ladder in access.ts must
// stay importable with no database (see its own header), while this file is
// the real `@openpanel/db` binding ~28 modules' `src/access.ts` files supply
// to it. Same shape as packages/trpc/src/access.ts's binding.
//
// M10-004: `project.service.ts`'s `getProjectById` now takes `ServiceDeps`,
// which this file has none of — reached through the v1-compat singleton
// instead (see v1-compat.ts's header). GENUINE CYCLE, kept lazy: auth.service.ts
// -> this file (via `access-lookups`) is already lazy on the OTHER side;
// v1-compat.ts -> services.ts -> project.service.ts has no edge back to this
// file, but `getAccessChecks()` in auth.service.ts reaches both this file and
// project.service.ts, so a static import here risks the same evaluation-order
// hazard `getAccessChecks()`'s own header warns about.
//
// M10-009: Postgres comes through that same seam (`compatDb()`), not a direct
// `import('@openpanel/db/...')`. Two of the three lookups here are `cacheable`,
// whose key is derived from the call's ARGUMENTS (packages/redis/cachable.ts),
// so they cannot take a `ServiceDeps` leading parameter at all; the third
// (`getClientAccess`) delegates to them and stays symmetric. What they get is
// the boot scope's `AppDeps.db` — the same client `ctx.db` is — rather than a
// second module-level singleton.

import type { AccessLevel } from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';

function loadDb() {
  return import('../v1-compat').then((m) => m.compatDb());
}

function loadProjectService() {
  return import('../v1-compat');
}

export interface IProjectAccess {
  level: AccessLevel;
}

/** Access levels that may mutate. `admin` is a superset of `write`. */
const WRITE_LEVELS: ReadonlySet<AccessLevel> = new Set<AccessLevel>([
  'write',
  'admin',
]);

export function canWriteProject(access: IProjectAccess | null): boolean {
  return !!access && WRITE_LEVELS.has(access.level);
}

/**
 * Resolve a user's access to one project.
 *
 * Returns a single shape - `{ level }` or `null` - on purpose. This used to
 * return `true` for members with no explicit ProjectAccess rows and the row
 * itself otherwise, which forced every caller into a `typeof access !==
 * 'boolean'` dance. 26 of 29 mutating procedures skipped the level check
 * entirely as a result (GHSA-f9rx-pxgw-c6rg); with one shape, omitting the
 * check is a type error rather than a silent grant.
 *
 * NOTE: the cache key is versioned. Changing the return shape without renaming
 * it would serve old-shape entries for up to 5 minutes across a rolling deploy.
 */
export const getProjectAccess = cacheable(
  'getProjectAccessV2',
  async ({
    userId,
    projectId,
  }: {
    userId: string;
    projectId: string;
  }): Promise<IProjectAccess | null> => {
    try {
      // Check if user has access to the project
      const project = await (await loadProjectService()).getProjectById(
        projectId
      );
      if (!project?.organizationId) {
        return null;
      }

      const db = await loadDb();
      const [projectAccess, member] = await Promise.all([
        db.projectAccess.findMany({
          where: {
            userId,
            organizationId: project.organizationId,
          },
        }),
        db.member.findFirst({
          where: {
            organizationId: project.organizationId,
            userId,
          },
        }),
      ]);

      if (!member) {
        return null;
      }

      // No explicit per-project grants means org-wide default access, and the
      // default is write.
      if (projectAccess.length === 0) {
        return { level: 'write' };
      }

      const row = projectAccess.find((item) => item.projectId === projectId);

      return row ? { level: row.level } : null;
    } catch (_err) {
      return null;
    }
  },
  60 * 5
);

export const getOrganizationAccess = cacheable(
  'getOrganizationAccess',
  async ({
    userId,
    organizationId,
  }: {
    userId: string;
    organizationId: string;
  }) => {
    const db = await loadDb();
    return db.member.findFirst({
      where: {
        userId,
        organizationId,
      },
    });
  },
  60 * 5
);

export async function getClientAccess({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}) {
  const db = await loadDb();
  const client = await db.client.findFirst({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    return false;
  }

  if (client.projectId) {
    return getProjectAccess({ userId, projectId: client.projectId });
  }

  if (client.organizationId) {
    return getOrganizationAccess({
      userId,
      organizationId: client.organizationId,
    });
  }

  return false;
}
