import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IRechartPayloadItem } from '@/hooks/useRechartDataModel';
import type { IToolTipProps } from '@/types';
import * as Portal from '@radix-ui/react-portal';
import { bind } from 'bind-event-listener';
import throttle from 'lodash.throttle';
import React, { useEffect, useState } from 'react';

import { useReportChartContext } from '../context';
import { PreviousDiffIndicator } from './previous-diff-indicator';
import { SerieIcon } from './serie-icon';
import { SerieName } from './serie-name';

type ReportLineChartTooltipProps = IToolTipProps<{
  value: number;
  name: string;
  dataKey: string;
  payload: Record<string, unknown>;
}>;

export function ReportChartTooltip({
  active,
  payload,
}: ReportLineChartTooltipProps) {
  const {
    report: { interval, unit },
  } = useReportChartContext();
  const formatDate = useFormatDateInterval(interval);
  const number = useNumber();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  const inactive = !active || !payload?.length;
  useEffect(() => {
    const setPositionThrottled = throttle(setPosition, 50);
    const unsubMouseMove = bind(window, {
      type: 'mousemove',
      listener(event) {
        if (!inactive) {
          setPositionThrottled({ x: event.clientX, y: event.clientY + 20 });
        }
      },
    });
    const unsubDragEnter = bind(window, {
      type: 'pointerdown',
      listener() {
        setPosition(null);
      },
    });

    return () => {
      unsubMouseMove();
      unsubDragEnter();
    };
  }, [inactive]);

  if (inactive) {
    return null;
  }

  const limit = 3;
  const sorted = payload
    .slice(0)
    .filter((item) => !item.dataKey.includes(':prev:count'))
    .filter((item) => !item.name.includes(':noTooltip'))
    .sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, limit);
  const hidden = sorted.slice(limit);

  const correctXPosition = (x: number | undefined) => {
    if (!x) {
      return undefined;
    }

    const tooltipWidth = 300;
    const screenWidth = window.innerWidth;
    const newX = x;

    if (newX + tooltipWidth > screenWidth) {
      return screenWidth - tooltipWidth;
    }
    return newX;
  };

  return (
    <Portal.Portal
      style={{
        position: 'fixed',
        top: position?.y,
        left: correctXPosition(position?.x),
        zIndex: 1000,
      }}
    >
      <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3  shadow-xl">
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
            <React.Fragment key={data.id}>
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
                <div className="col flex-1 gap-1">
                  <div className="flex items-center gap-1">
                    <SerieIcon name={data.names} />
                    <SerieName name={data.names} />
                  </div>
                  <div className="flex justify-between gap-8 font-mono font-medium">
                    <div className="row gap-1">
                      {number.formatWithUnit(data.count, unit)}
                      {!!data.previous && (
                        <span className="text-muted-foreground">
                          ({number.formatWithUnit(data.previous.value, unit)})
                        </span>
                      )}
                    </div>

                    <PreviousDiffIndicator {...data.previous} />
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {hidden.length > 0 && (
          <div className="text-muted-foreground">
            and {hidden.length} more...
          </div>
        )}
      </div>
    </Portal.Portal>
  );
}
