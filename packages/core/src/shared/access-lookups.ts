// The concrete, Prisma-backed access lookups (M8-005, moved from
// packages/db/src/services/access.service.ts). Deliberately a sibling of
// shared/access.ts rather than living inside it: the ladder in access.ts must
// stay importable with no database (see its own header), while this file is
// the real `@openpanel/db` binding ~28 modules' `src/access.ts` files supply
// to it. Same shape as packages/trpc/src/access.ts's binding.
//
// M15-005: Postgres comes from `context.ts`'s `unscopedDb()`. Two of the three
// lookups here are `cacheable`, whose key is derived from the call's ARGUMENTS
// (packages/redis/cachable.ts), so they cannot take a `ServiceDeps` leading
// parameter at all; the third (`getClientAccess`) delegates to them and stays
// symmetric. Their bare signature is also a protected wire contract —
// `verification/contracts/auth/group-b-project-access.mts` imports them through
// `packages/db/src/services/access.service.ts` with no app boot at all, so the
// handle has to be one this file can resolve on its own. It is the same client
// `ctx.db` is, not a second one.
//
// `getProjectById` is spelled here rather than imported from
// `project.service.ts`: `shared/` sits below `modules/` (ADR-022 R22) and the
// ladder reads one field off the row.

import type { AccessLevel } from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';

// Lazy, as the seam this replaces was: `context.ts` value-imports
// `services.ts`, so a static import here would drag the whole 36-service graph
// into the import graph of everything that reaches this file.
function unscopedDb() {
  return import('../context').then((m) => m.unscopedDb());
}

/**
 * The project row the ladder reads (`shared/access.ts`'s `AccessLookups`).
 * Same query as `project.service.ts`'s `getProjectById`, without the scope
 * that file's callers have and this one does not.
 */
export async function getProjectById(
  projectId: string
): Promise<{ organizationId: string | null } | null> {
  const db = await unscopedDb();
  return db.project.findUnique({ where: { id: projectId } });
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
      const project = await getProjectById(projectId);
      if (!project?.organizationId) {
        return null;
      }

      const db = await unscopedDb();
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
    const db = await unscopedDb();
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
  const db = await unscopedDb();
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
