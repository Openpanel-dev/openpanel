import type { ServiceDeps } from '../../../../services';
import { getDashboardById } from '../../../dashboard/dashboard.service';

/**
 * Bind a caller-supplied dashboard id to the resolved project.
 *
 * Every tool that reads a dashboard's contents must call this FIRST: the
 * lookup is scoped by `projectId`, so a dashboard belonging to another
 * project is indistinguishable from one that does not exist. Checking
 * ownership after the read instead lets an empty foreign dashboard answer
 * with a normal empty result.
 */
export async function requireDashboard(
  deps: ServiceDeps,
  projectId: string,
  dashboardId: string
) {
  const dashboard = await getDashboardById(deps, dashboardId, projectId);
  if (!dashboard) {
    throw new Error('Dashboard not found');
  }
  return dashboard;
}
