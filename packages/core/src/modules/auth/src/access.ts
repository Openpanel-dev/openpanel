// The permission ladder. M15-009 (R22): it lives in the auth module, not in
// `shared/` — it threw a transport error (`TRPCForbiddenError`) from the bottom
// layer, and R10 puts every access check in the auth service and the procedure
// builders.
//
// Ported verbatim from packages/trpc/src/access.ts — the rules, the fail-closed
// ordering and the messages are unchanged, and ADR-011 invariants 5 and 6 bind
// them. What changed is the shape: the four data lookups arrive as an injected
// `AccessLookups` instead of being imported from `@openpanel/db`.
//
// That injection is not decoration. Core must stay importable without a
// database — `bun test` loads this package with no DATABASE_URL and no Prisma
// client — and it is the same seam `createCacheMiddleware` and
// `createRateLimitMiddleware` already use in rpc/base.ts. `auth.service.ts`'s
// `createAccessChecks` call binds it to the real services; V1's now-deleted
// `@openpanel/trpc` used to bind it the same way; a test binds it to two
// functions.

import { TRPCForbiddenError } from '../../../rpc/errors';

/** What a project access row has to expose for the ladder to read it. */
export interface ProjectAccessLike {
  level: string;
}

export interface OrganizationAccessLike {
  role: string;
}

/**
 * The four reads the ladder needs. Deliberately the *service* functions, not a
 * Prisma client: `getProjectAccess` carries the 5-minute Redis cache and the
 * fail-closed swallow (ADR-011 invariant 5, 7), and reimplementing it here
 * would be a second, diverging copy of the rule this file exists to enforce.
 */
export interface AccessLookups<
  TProjectAccess extends ProjectAccessLike = ProjectAccessLike,
  TOrganizationAccess extends OrganizationAccessLike = OrganizationAccessLike,
> {
  getProjectAccess(args: {
    userId: string;
    projectId: string;
  }): Promise<TProjectAccess | null>;
  /** ADR-011 invariant 6: level in {write, admin}; admin stays a superset. */
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
 * The permission ladder.
 *
 * Two independent controls, each with one job:
 *
 *  - ADMIN is the organization role (`member.role === 'org:admin'`). It gates
 *    destruction and billing.
 *  - WRITE is the per-project access level. It gates every mutation. `admin`
 *    level counts as a superset of `write`.
 *  - READ is the floor: membership of the project, which is what queries need.
 *
 * They are deliberately separate. Project levels were unenforced for so long
 * that the value stored on most rows was never chosen by anyone, so hanging
 * destructive operations off the org role avoids retroactively giving meaning
 * to that data.
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
