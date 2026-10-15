// The Prisma-backed access lookups, a sibling of `modules/auth/src/access.ts`
// so that ladder stays importable with no database. Two lookups are `cacheable`
// on their ARGUMENTS and so cannot take a `ServiceDeps` parameter; Postgres
// comes from `context.ts`'s `unscopedDb` (the same client as `ctx.db`).
//
// `getProjectById` is spelled here because `shared/` sits below `modules/`.

import type {
  AccessLevel,
  Member,
  ProjectScope,
} from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';

// Lazy: `context.ts` value-imports `services.ts`, and a static import would
// drag the whole services graph into everything that reaches this file.
function unscopedDb() {
  return import('../context').then((m) => m.unscopedDb());
}

/** The project row the access ladder reads. */
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

/** The one role that only reads. Spelled here so `shared/` carries no other role vocabulary. */
const READ_ONLY_ROLE = 'viewer';

/**
 * The project access rule, pure so tests and the access snapshot can run it
 * without a database. `all` follows every project of the organization;
 * `selected` means the member's rows and nothing else. A row's `level` only
 * ever restricts below what the role gives.
 */
export function resolveProjectAccess(member: {
  role: string;
  projectScope: ProjectScope;
  grant: { level: AccessLevel | null } | null;
}): IProjectAccess | null {
  const roleLevel: AccessLevel =
    member.role === READ_ONLY_ROLE ? 'read' : 'write';
  if (member.projectScope === 'all') {
    return { level: roleLevel };
  }
  if (!member.grant) {
    return null;
  }
  if (roleLevel === 'read') {
    return { level: 'read' };
  }
  return { level: member.grant.level ?? roleLevel };
}

/**
 * Resolve a user's access to one project.
 *
 * Returns a single shape, `{ level }` or `null`, on purpose: returning `true`
 * for some members forced callers into a `typeof access !== 'boolean'` dance
 * and 26 of 29 mutating procedures skipped the level check (GHSA-f9rx-pxgw-c6rg).
 * With one shape, omitting the check is a type error.
 *
 * The cache key is versioned: changing the rule or the return shape without
 * renaming it would serve old entries for up to 5 minutes across a rolling
 * deploy.
 */
export const getProjectAccess = cacheable(
  'getProjectAccessV3',
  async ({
    userId,
    projectId,
  }: {
    userId: string;
    projectId: string;
  }): Promise<IProjectAccess | null> => {
    try {
      const project = await getProjectById(projectId);
      if (!project?.organizationId) {
        return null;
      }

      const db = await unscopedDb();
      const member = await db.member.findFirst({
        where: {
          organizationId: project.organizationId,
          userId,
        },
        select: {
          role: true,
          projectScope: true,
          projects: { where: { projectId }, select: { level: true } },
        },
      });

      if (!member) {
        return null;
      }

      return resolveProjectAccess({
        role: member.role,
        projectScope: member.projectScope,
        grant: member.projects[0] ?? null,
      });
    } catch (_err) {
      return null;
    }
  },
  60 * 5
);

/** The membership row plus what the auth module needs to derive the owner role. */
export type IOrganizationAccess = Member & {
  organization: { createdByUserId: string | null };
};

export const getOrganizationAccess = cacheable(
  'getOrganizationAccessV2',
  async ({
    userId,
    organizationId,
  }: {
    userId: string;
    organizationId: string;
  }): Promise<IOrganizationAccess | null> => {
    const db = await unscopedDb();
    return db.member.findFirst({
      where: {
        userId,
        organizationId,
      },
      include: { organization: { select: { createdByUserId: true } } },
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
