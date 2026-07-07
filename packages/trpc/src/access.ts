import type { DashboardRole } from '@openpanel/db';

export {
  getOrganizationAccess,
  getProjectAccess,
  getClientAccess,
  getDashboardAccess,
} from '@openpanel/db';
export type { DashboardRole } from '@openpanel/db';

export function canEditDashboard(role: DashboardRole | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'edit';
}

export function canManageDashboard(role: DashboardRole | null | undefined) {
  return role === 'owner' || role === 'admin';
}
