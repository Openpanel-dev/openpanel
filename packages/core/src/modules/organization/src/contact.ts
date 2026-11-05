import { STORED_ADMIN_ROLES } from '../organization.constants';

export interface OrganizationContact {
  id: string;
  email: string;
  firstName: string | null;
}

/** The Prisma `include` `getOrganizationContact` reads: current admins, longest-standing first. */
export const ORGANIZATION_ADMINS_INCLUDE = {
  members: {
    where: { role: { in: STORED_ADMIN_ROLES }, user: { deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { id: true, email: true, firstName: true } } },
  },
} as const;

export interface OrganizationWithAdmins {
  createdByUserId: string | null;
  members: { user: OrganizationContact | null }[];
}

/**
 * Who an organization's lifecycle mail goes to: the creator while they are
 * still an admin, else the longest-standing admin. `createdBy` outlives the
 * membership, so mailing it would keep sending usage to someone removed.
 */
export function getOrganizationContact(
  organization: OrganizationWithAdmins
): OrganizationContact | null {
  const admins = organization.members.flatMap((member) =>
    member.user ? [member.user] : []
  );
  return (
    admins.find((admin) => admin.id === organization.createdByUserId) ??
    admins[0] ??
    null
  );
}
