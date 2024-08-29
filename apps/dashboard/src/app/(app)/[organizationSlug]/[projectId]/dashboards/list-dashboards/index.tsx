import FullPageLoadingState from '@/components/full-page-loading-state';
import withSuspense from '@/hocs/with-suspense';

import { getDashboardsByProjectId } from '@openpanel/db';

import { HeaderDashboards } from './header';
import { ListDashboards } from './list-dashboards';

interface Props {
  projectId: string;
}

const ListDashboardsServer = async ({ projectId }: Props) => {
  const dashboards = await getDashboardsByProjectId(projectId);

  return (
    <div>
      {dashboards.length > 0 && <HeaderDashboards />}
      <ListDashboards dashboards={dashboards} />;
    </div>
  );
};

export default withSuspense(ListDashboardsServer, FullPageLoadingState);
