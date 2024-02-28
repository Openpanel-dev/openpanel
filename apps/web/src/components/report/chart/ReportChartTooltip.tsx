import React from 'react';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useMappings } from '@/hooks/useMappings';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IRechartPayloadItem } from '@/hooks/useRechartDataModel';
import type { IToolTipProps } from '@/types';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';

type ReportLineChartTooltipProps = IToolTipProps<{
  value: number;
  dataKey: string;
  payload: Record<string, unknown>;
}>;

export function ReportChartTooltip({
  active,
  payload,
}: ReportLineChartTooltipProps) {
  const { unit, interval } = useChartContext();
  const getLabel = useMappings();
  const formatDate = useFormatDateInterval(interval);
  const number = useNumber();
  if (!active || !payload) {
    return null;
  }

  if (!payload.length) {
    return null;
  }

  const limit = 3;
  const sorted = payload
    .slice(0)
    .filter((item) => !item.dataKey.includes(':prev:count'))
    .sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, limit);
  const hidden = sorted.slice(limit);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm shadow-xl min-w-[180px]">
      {visible.map((item, index) => {
        // If we have a <Cell /> component, payload can be nested
        const payload = item.payload.payload ?? item.payload;
        const data = (
          item.dataKey.includes(':')
            ? // @ts-expect-error
              payload[`${item.dataKey.split(':')[0]}:payload`]
            : payload
        ) as IRechartPayloadItem;

        return (
          <React.Fragment key={data.label}>
            {index === 0 && data.date && (
              <div className="flex justify-between gap-8">
                <div>{formatDate(new Date(data.date))}</div>
              </div>
            )}
            <div className="flex gap-2">
              <div
                className="w-[3px] rounded-full"
                style={{ background: data.color }}
              />
              <div className="flex flex-col flex-1">
                <div className="min-w-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {getLabel(data.label)}
                </div>
                <div className="flex justify-between gap-8">
                  <div>{number.formatWithUnit(data.count, unit)}</div>

                  <div className="flex gap-1">
                    <PreviousDiffIndicator {...data.previous}>
                      {!!data.previous &&
                        `(${number.formatWithUnit(data.previous.value, unit)})`}
                    </PreviousDiffIndicator>
                  </div>
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {hidden.length > 0 && (
        <div className="text-muted-foreground">and {hidden.length} more...</div>
      )}
    </div>
  );
}
