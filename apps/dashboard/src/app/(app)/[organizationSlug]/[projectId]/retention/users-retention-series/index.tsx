import { Widget, WidgetHead } from '@/components/widget';
import withLoadingWidget from '@/hocs/with-loading-widget';

import { getRetentionSeries } from '@openpanel/db';

import Chart from './chart';

type Props = {
  projectId: string;
};

const UsersRetentionSeries = async ({ projectId }: Props) => {
  const res = await getRetentionSeries({ projectId });

  return (
    <Widget className="w-full">
      <WidgetHead>
        <span className="title">Stickyness / Retention (%)</span>
      </WidgetHead>
      <Chart data={res} />
    </Widget>
  );
};

export default withLoadingWidget(UsersRetentionSeries);
