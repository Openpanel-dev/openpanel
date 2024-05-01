import { Widget, WidgetHead } from '@/components/widget';
import withLoadingWidget from '@/hocs/with-loading-widget';

import { getRetentionLastSeenSeries } from '@openpanel/db';

import Chart from './chart';

type Props = {
  projectId: string;
};

const LastActiveUsersServer = async ({ projectId }: Props) => {
  const res = await getRetentionLastSeenSeries({ projectId });

  return (
    <Widget className="w-full">
      <WidgetHead>
        <span className="title">Last time in days a user was active</span>
      </WidgetHead>
      <Chart data={res} />
    </Widget>
  );
};

export default withLoadingWidget(LastActiveUsersServer);
