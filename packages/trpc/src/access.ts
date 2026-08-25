import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
  getProjectById,
} from '@openpanel/db';
import { TRPCForbiddenError } from './errors';

export {
  getOrganizationAccess,
  getProjectAccess,
  getClientAccess,
} from '@openpanel/db';

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

/**
 * Assert the caller may act on a project at the given level.
 *
 * Prefer this over calling `getProjectAccess` and testing truthiness: a truthy
 * result only proves membership, which is how a read-only member could delete
 * reports and publish private analytics (GHSA-f9rx-pxgw-c6rg).
 */
export async function requireProjectAccess({
  userId,
  projectId,
  level,
}: {
  userId: string;
  projectId: string;
  level: 'read' | 'write';
}) {
  const access = await getProjectAccess({ userId, projectId });

  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this project');
  }

  if (level === 'write' && !canWriteProject(access)) {
    throw new TRPCForbiddenError(
      'You have read-only access to this project',
    );
  }

  return access;
}

/** Assert the caller is an admin of the organization. */
export async function requireOrganizationAdmin({
  userId,
  organizationId,
  message = 'Only organization admins can do this',
}: {
  userId: string;
  organizationId: string;
  message?: string;
}) {
  const access = await getOrganizationAccess({ userId, organizationId });

  if (access?.role !== 'org:admin') {
    throw new TRPCForbiddenError(message);
  }

  return access;
}

/**
 * Assert the caller is an admin of the organization that owns a project, for
 * the destructive procedures that only receive a `projectId`.
 */
export async function requireProjectAdmin({
  userId,
  projectId,
  message,
}: {
  userId: string;
  projectId: string;
  message?: string;
}) {
  const project = await getProjectById(projectId);

  if (!project?.organizationId) {
    throw new TRPCForbiddenError('You do not have access to this project');
  }

  return requireOrganizationAdmin({
    userId,
    organizationId: project.organizationId,
    message,
  });
}
