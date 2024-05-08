import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import withSuspense from '@/hocs/with-suspense';
import type { LucideIcon } from 'lucide-react';
import { Loader2Icon } from 'lucide-react';

import { getDashboardsByProjectId } from '@openpanel/db';

import { HeaderDashboards } from './header';
import { ListDashboards } from './list-dashboards';

interface Props {
  projectId: string;
}

const ListDashboardsServer = async ({ projectId }: Props) => {
  const dashboards = await getDashboardsByProjectId(projectId);

  return <ListDashboards dashboards={dashboards} />;
};

export default withSuspense(ListDashboardsServer, FullPageLoadingState);
