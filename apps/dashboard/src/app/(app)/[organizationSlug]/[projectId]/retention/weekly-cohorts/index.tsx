import { Widget, WidgetHead } from '@/components/widget';
import { WidgetTableHead } from '@/components/widget-table';
import withLoadingWidget from '@/hocs/with-loading-widget';
import { cn } from '@/utils/cn';

import { getRetentionCohortTable } from '@openpanel/db';

type Props = {
  projectId: string;
};

const Cell = ({ value, ratio }: { value: number; ratio: number }) => {
  return (
    <td
      className={cn('relative h-8 border', ratio !== 0 && 'border-background')}
    >
      <div
        className="absolute inset-0 z-0 bg-highlight"
        style={{ opacity: ratio }}
      />
      <div className="relative z-10">{value}</div>
    </td>
  );
};

const WeeklyCohortsServer = async ({ projectId }: Props) => {
  const res = await getRetentionCohortTable({ projectId });

  const minValue = 0;
  const maxValue = Math.max(
    ...res.flatMap((row) => [
      row.period_0,
      row.period_1,
      row.period_2,
      row.period_3,
      row.period_4,
      row.period_5,
      row.period_6,
      row.period_7,
      row.period_8,
      row.period_9,
    ]),
  );

  const calculateRatio = (currentValue: number) =>
    currentValue === 0
      ? 0
      : Math.max(
          0.1,
          Math.min(1, (currentValue - minValue) / (maxValue - minValue)),
        );

  return (
    <Widget>
      <WidgetHead>
        <span className="title">Weekly Cohorts</span>
      </WidgetHead>
      <div className="overflow-hidden rounded-b-xl">
        <div className="-m-px">
          <table className="w-full table-fixed border-collapse text-center">
            <WidgetTableHead className="[&_th]:border-b-2 [&_th]:!text-center">
              <tr>
                <th>Week</th>
                <th>0</th>
                <th>1</th>
                <th>2</th>
                <th>3</th>
                <th>4</th>
                <th>5</th>
                <th>6</th>
                <th>7</th>
                <th>8</th>
                <th>9</th>
              </tr>
            </WidgetTableHead>
            <tbody>
              {res.map((row) => (
                <tr key={row.first_seen}>
                  <td className="text-def-1000 bg-def-100  font-medium">
                    {row.first_seen}
                  </td>
                  <Cell
                    value={row.period_0}
                    ratio={calculateRatio(row.period_0)}
                  />
                  <Cell
                    value={row.period_1}
                    ratio={calculateRatio(row.period_1)}
                  />
                  <Cell
                    value={row.period_2}
                    ratio={calculateRatio(row.period_2)}
                  />
                  <Cell
                    value={row.period_3}
                    ratio={calculateRatio(row.period_3)}
                  />
                  <Cell
                    value={row.period_4}
                    ratio={calculateRatio(row.period_4)}
                  />
                  <Cell
                    value={row.period_5}
                    ratio={calculateRatio(row.period_5)}
                  />
                  <Cell
                    value={row.period_6}
                    ratio={calculateRatio(row.period_6)}
                  />
                  <Cell
                    value={row.period_7}
                    ratio={calculateRatio(row.period_7)}
                  />
                  <Cell
                    value={row.period_8}
                    ratio={calculateRatio(row.period_8)}
                  />
                  <Cell
                    value={row.period_9}
                    ratio={calculateRatio(row.period_9)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Widget>
  );
};

export default withLoadingWidget(WeeklyCohortsServer);
