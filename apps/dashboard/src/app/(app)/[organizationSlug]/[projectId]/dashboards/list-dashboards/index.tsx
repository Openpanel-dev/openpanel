import FullPageLoadingState from '@/components/full-page-loading-state';
import { Padding } from '@/components/ui/padding';
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
    <Padding>
      <HeaderDashboards />
      <ListDashboards dashboards={dashboards} />
    </Padding>
  );
};

export default withSuspense(ListDashboardsServer, FullPageLoadingState);
