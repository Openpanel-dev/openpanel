import type { AccessLevel } from '../generated/prisma/client';
import { cacheable } from '@openpanel/redis';
import { db } from '../prisma-client';
import { getProjectById } from './project.service';

export type IProjectAccess = { level: AccessLevel };

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
    } catch (err) {
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
