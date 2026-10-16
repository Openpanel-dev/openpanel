// Lives in the auth module, not `shared/`: it throws a transport error
// (`TRPCForbiddenError`).
//
// The data lookups are injected rather than imported from `@openpanel/db` so
// core stays importable without a database: `bun test` loads this package with
// no DATABASE_URL and no Prisma client.

import { TRPCForbiddenError } from '../../../rpc/errors';

/** What a project access row has to expose for the ladder to read it. */
export interface ProjectAccessLike {
  level: string;
}

export interface OrganizationAccessLike {
  role: string;
}

/**
 * The four reads the ladder needs. Deliberately the *service* functions, not
 * a Prisma client: `getProjectAccess` carries the 5-minute Redis cache and
 * the fail-closed swallow, and reimplementing it here would be a second,
 * diverging copy of the rule this file exists to enforce.
 */
export interface AccessLookups<
  TProjectAccess extends ProjectAccessLike = ProjectAccessLike,
  TOrganizationAccess extends OrganizationAccessLike = OrganizationAccessLike,
> {
  getProjectAccess(args: {
    userId: string;
    projectId: string;
  }): Promise<TProjectAccess | null>;
  /** level in {write, admin}; admin stays a superset. */
  canWriteProject(access: TProjectAccess | null): boolean;
  getOrganizationAccess(args: {
    userId: string;
    organizationId: string;
  }): Promise<TOrganizationAccess | null>;
  getProjectById(
    projectId: string
  ): Promise<{ organizationId: string | null } | null>;
}

export interface AccessChecks<
  TProjectAccess extends ProjectAccessLike = ProjectAccessLike,
  TOrganizationAccess extends OrganizationAccessLike = OrganizationAccessLike,
> {
  requireProjectAccess(args: {
    userId: string;
    projectId: string;
    level: 'read' | 'write';
  }): Promise<TProjectAccess>;
  requireOrganizationAdmin(args: {
    userId: string;
    organizationId: string;
    message?: string;
  }): Promise<TOrganizationAccess>;
  requireProjectAdmin(args: {
    userId: string;
    projectId: string;
    message?: string;
  }): Promise<TOrganizationAccess>;
}

const ORGANIZATION_ADMIN_ROLE = 'org:admin';

/**
 * The permission ladder. Two independent controls:
 *
 *  - ADMIN is the organization role (`member.role === 'org:admin'`). It gates
 *    destruction and billing.
 *  - WRITE is the per-project access level. It gates every mutation; `admin`
 *    level counts as a superset of `write`.
 *  - READ is the floor: membership of the project.
 *
 * They are separate because project levels were unenforced for so long that
 * the stored value on most rows was never chosen by anyone, so hanging
 * destructive operations off the org role avoids giving meaning to that data.
 */
export function createAccessChecks<
  TProjectAccess extends ProjectAccessLike,
  TOrganizationAccess extends OrganizationAccessLike,
>(
  lookups: AccessLookups<TProjectAccess, TOrganizationAccess>
): AccessChecks<TProjectAccess, TOrganizationAccess> {
  /**
   * Assert the caller may act on a project at the given level.
   *
   * Prefer this over calling `getProjectAccess` and testing truthiness: a
   * truthy result only proves membership, which is how a read-only member
   * could delete reports and publish private analytics (GHSA-f9rx-pxgw-c6rg).
   */
  async function requireProjectAccess({
    userId,
    projectId,
    level,
  }: {
    userId: string;
    projectId: string;
    level: 'read' | 'write';
  }): Promise<TProjectAccess> {
    const access = await lookups.getProjectAccess({ userId, projectId });

    if (!access) {
      throw new TRPCForbiddenError('You do not have access to this project');
    }

    if (level === 'write' && !lookups.canWriteProject(access)) {
      throw new TRPCForbiddenError('You have read-only access to this project');
    }

    return access;
  }

  /** Assert the caller is an admin of the organization. */
  async function requireOrganizationAdmin({
    userId,
    organizationId,
    message = 'Only organization admins can do this',
  }: {
    userId: string;
    organizationId: string;
    message?: string;
  }): Promise<TOrganizationAccess> {
    const access = await lookups.getOrganizationAccess({
      userId,
      organizationId,
    });

    if (access?.role !== ORGANIZATION_ADMIN_ROLE) {
      throw new TRPCForbiddenError(message);
    }

    return access;
  }

  /**
   * Assert the caller is an admin of the organization that owns a project, for
   * the destructive procedures that only receive a `projectId`.
   */
  async function requireProjectAdmin({
    userId,
    projectId,
    message,
  }: {
    userId: string;
    projectId: string;
    message?: string;
  }): Promise<TOrganizationAccess> {
    const project = await lookups.getProjectById(projectId);

    if (!project?.organizationId) {
      throw new TRPCForbiddenError('You do not have access to this project');
    }

    return await requireOrganizationAdmin({
      userId,
      organizationId: project.organizationId,
      message,
    });
  }

  return {
    requireProjectAccess,
    requireOrganizationAdmin,
    requireProjectAdmin,
  };
}
