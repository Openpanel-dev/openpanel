import { Widget, WidgetHead } from '@/components/widget';
import withLoadingWidget from '@/hocs/with-loading-widget';

import { getRollingActiveUsers } from '@openpanel/db';

import Chart from './chart';

type Props = {
  projectId: string;
};

const RollingActiveUsersServer = async ({ projectId }: Props) => {
  const series = await Promise.all([
    await getRollingActiveUsers({ projectId, days: 1 }),
    await getRollingActiveUsers({ projectId, days: 7 }),
    await getRollingActiveUsers({ projectId, days: 30 }),
  ]);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <span className="title">Rolling active users</span>
      </WidgetHead>
      <Chart
        data={{
          daily: series[0],
          weekly: series[1],
          monthly: series[2],
        }}
      />
    </Widget>
  );
};

export default withLoadingWidget(RollingActiveUsersServer);
