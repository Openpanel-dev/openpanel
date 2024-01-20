import * as React from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useMappings } from '@/hooks/useMappings';
import { useSelector } from '@/redux';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface ReportTableProps {
  data: IChartData;
  visibleSeries: IChartData['series'];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}

export function ReportTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ReportTableProps) {
  const interval = useSelector((state) => state.report.interval);
  const formatDate = useFormatDateInterval(interval);
  const getLabel = useMappings();

  function handleChange(name: string, checked: boolean) {
    setVisibleSeries((prev) => {
      if (checked) {
        return [...prev, name];
      } else {
        return prev.filter((item) => item !== name);
      }
    });
  }

  const row = 'flex border-b border-border last:border-b-0 flex-1';
  const cell = 'p-2 last:pr-8 last:w-[8rem]';
  const value = 'min-w-[6rem] text-right';
  const header = 'text-sm font-medium';
  const total =
    'bg-gray-50 text-emerald-600 font-medium border-r border-border';
  return (
    <>
      <div className="flex w-fit max-w-full rounded-md border border-border bg-white">
        {/* Labels */}
        <div className="border-r border-border">
          <div className={cn(header, row, cell)}>Name</div>
          {data.series.map((serie, index) => {
            const checked = !!visibleSeries.find(
              (item) => item.name === serie.name
            );

            return (
              <div
                key={serie.name}
                className={cn(
                  'flex max-w-[200px] lg:max-w-[400px] xl:max-w-[600px] w-full min-w-full items-center gap-2',
                  row,
                  // avoid using cell since its better on the right side
                  'p-2'
                )}
              >
                <Checkbox
                  onCheckedChange={(checked) =>
                    handleChange(serie.name, !!checked)
                  }
                  style={
                    checked
                      ? {
                          background: getChartColor(index),
                          borderColor: getChartColor(index),
                        }
                      : undefined
                  }
                  checked={checked}
                />
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div className="min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
                      {getLabel(serie.name)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{getLabel(serie.name)}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>

        {/* ScrollView for all values */}
        <div className="w-full overflow-auto">
          {/* Header */}
          <div className={cn('w-max', row)}>
            <div className={cn(header, value, cell, total)}>Total</div>
            <div className={cn(header, value, cell, total)}>Average</div>
            {data.series[0]?.data.map((serie) => (
              <div
                key={serie.date.toString()}
                className={cn(header, value, cell)}
              >
                {formatDate(serie.date)}
              </div>
            ))}
          </div>

          {/* Values */}
          {data.series.map((serie) => {
            return (
              <div className={cn('w-max', row)} key={serie.name}>
                <div className={cn(header, value, cell, total)}>
                  {serie.metrics.sum}
                </div>
                <div className={cn(header, value, cell, total)}>
                  {serie.metrics.average}
                </div>
                {serie.data.map((item) => {
                  return (
                    <div key={item.date} className={cn(value, cell)}>
                      {item.count}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex gap-1">
          <div>Total</div>
          <div>{data.metrics.sum}</div>
        </div>
        <div className="flex gap-1">
          <div>Average</div>
          <div>{data.metrics.averge}</div>
        </div>
        <div className="flex gap-1">
          <div>Min</div>
          <div>{data.metrics.min}</div>
        </div>
        <div className="flex gap-1">
          <div>Max</div>
          <div>{data.metrics.max}</div>
        </div>
      </div>
    </>
  );
}
