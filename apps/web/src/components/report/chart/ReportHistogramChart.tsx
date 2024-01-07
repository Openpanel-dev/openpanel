import { useEffect, useRef, useState } from 'react';
import { AutoSizer } from '@/components/AutoSizer';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import type { IChartData, IInterval } from '@/types';
import { alphabetIds } from '@/utils/constants';
import { getChartColor } from '@/utils/theme';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { useChartContext } from './ChartProvider';
import { ReportLineChartTooltip } from './ReportLineChartTooltip';
import { ReportTable } from './ReportTable';

interface ReportHistogramChartProps {
  data: IChartData;
  interval: IInterval;
}

export function ReportHistogramChart({
  interval,
  data,
}: ReportHistogramChartProps) {
  const { editMode } = useChartContext();
  const [visibleSeries, setVisibleSeries] = useState<string[]>([]);
  const formatDate = useFormatDateInterval(interval);

  const ref = useRef(false);
  useEffect(() => {
    if (!ref.current && data) {
      const max = 20;

      setVisibleSeries(
        data?.series?.slice(0, max).map((serie) => serie.name) ?? []
      );
      // ref.current = true;
    }
  }, [data]);

  const rel = data.series[0]?.data.map(({ date }) => {
    return {
      date,
      ...data.series.reduce((acc, serie, idx) => {
        return {
          ...acc,
          ...serie.data.reduce(
            (acc2, item) => {
              const id = alphabetIds[idx];
              if (item.date === date) {
                acc2[`${id}:count`] = item.count;
                acc2[`${id}:label`] = item.label;
              }
              return acc2;
            },
            {} as Record<string, any>
          ),
        };
      }, {}),
    };
  });

  return (
    <>
      <div className="max-sm:-mx-3">
        <AutoSizer disableHeight>
          {({ width }) => (
            <BarChart
              width={width}
              height={Math.min(Math.max(width * 0.5, 250), 400)}
              data={rel}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip content={<ReportLineChartTooltip />} />
              <XAxis
                fontSize={12}
                dataKey="date"
                tickFormatter={formatDate}
                tickLine={false}
              />
              {data.series.map((serie, index) => {
                const id = alphabetIds[index];
                return (
                  <>
                    <YAxis dataKey={`${id}:count`} fontSize={12}></YAxis>
                    <Bar
                      stackId={id}
                      key={serie.name}
                      isAnimationActive={false}
                      name={serie.name}
                      dataKey={`${id}:count`}
                      fill={getChartColor(index)}
                    />
                  </>
                );
              })}
            </BarChart>
          )}
        </AutoSizer>
      </div>
      {editMode && (
        <ReportTable
          data={data}
          visibleSeries={visibleSeries}
          setVisibleSeries={setVisibleSeries}
        />
      )}
    </>
  );
}
