import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import React from 'react';

import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import type { IInterval } from '@openpanel/validation';
import { SerieIcon } from '../report-chart/common/serie-icon';

type Data = {
  date: string;
  timestamp: number;
  [key: `${string}:sessions`]: number;
  [key: `${string}:pageviews`]: number;
  [key: `${string}:revenue`]: number | undefined;
  [key: `${string}:payload`]: {
    name: string;
    prefix?: string;
    color: string;
  };
};

type Context = {
  interval: IInterval;
};

export const OverviewLineChartTooltip = createChartTooltip<Data, Context>(
  ({ context: { interval }, data }) => {
    const formatDate = useFormatDateInterval({
      interval,
      short: false,
    });
    const number = useNumber();

    if (!data || data.length === 0) {
      return null;
    }

    const firstItem = data[0];

    // Get all payload items from the first data point
    // Keys are in format "prefix:name:payload" or "name:payload"
    const payloadItems = Object.keys(firstItem)
      .filter((key) => key.endsWith(':payload'))
      .map((key) => {
        const payload = firstItem[key as keyof typeof firstItem] as {
          name: string;
          prefix?: string;
          color: string;
        };
        // Extract the base key (without :payload) to access sessions/pageviews/revenue
        const baseKey = key.replace(':payload', '');
        return {
          payload,
          baseKey,
        };
      })
      .filter(
        (item) =>
          item.payload &&
          typeof item.payload === 'object' &&
          'name' in item.payload,
      );

    // Sort by sessions (descending)
    const sorted = payloadItems.sort((a, b) => {
      const aSessions =
        (firstItem[
          `${a.baseKey}:sessions` as keyof typeof firstItem
        ] as number) ?? 0;
      const bSessions =
        (firstItem[
          `${b.baseKey}:sessions` as keyof typeof firstItem
        ] as number) ?? 0;
      return bSessions - aSessions;
    });

    const limit = 3;
    const visible = sorted.slice(0, limit);
    const hidden = sorted.slice(limit);

    return (
      <>
        {visible.map((item, index) => {
          const sessions =
            (firstItem[
              `${item.baseKey}:sessions` as keyof typeof firstItem
            ] as number) ?? 0;
          const pageviews =
            (firstItem[
              `${item.baseKey}:pageviews` as keyof typeof firstItem
            ] as number) ?? 0;
          const revenue = firstItem[
            `${item.baseKey}:revenue` as keyof typeof firstItem
          ] as number | undefined;

          return (
            <React.Fragment key={item.baseKey}>
              {index === 0 && firstItem.date && (
                <ChartTooltipHeader>
                  <div>{formatDate(new Date(firstItem.date))}</div>
                </ChartTooltipHeader>
              )}
              <ChartTooltipItem color={item.payload.color}>
                <div className="flex items-center gap-1">
                  <SerieIcon name={item.payload.prefix || item.payload.name} />
                  <div className="font-medium">
                    {item.payload.prefix && (
                      <>
                        <span className="text-muted-foreground">
                          {item.payload.prefix}
                        </span>
                        <span className="mx-1">/</span>
                      </>
                    )}
                    {item.payload.name || 'Not set'}
                  </div>
                </div>
                <div className="col gap-1 text-sm">
                  {revenue !== undefined && revenue > 0 && (
                    <div className="flex justify-between gap-8 font-mono font-medium">
                      <span className="text-muted-foreground">Revenue</span>
                      <span style={{ color: '#3ba974' }}>
                        {number.currency(revenue / 100, { short: true })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 font-mono font-medium">
                    <span className="text-muted-foreground">Pageviews</span>
                    <span>{number.short(pageviews)}</span>
                  </div>
                  <div className="flex justify-between gap-8 font-mono font-medium">
                    <span className="text-muted-foreground">Sessions</span>
                    <span>{number.short(sessions)}</span>
                  </div>
                </div>
              </ChartTooltipItem>
            </React.Fragment>
          );
        })}
        {hidden.length > 0 && (
          <div className="text-muted-foreground text-sm">
            and {hidden.length} more {hidden.length === 1 ? 'item' : 'items'}
          </div>
        )}
      </>
    );
  },
);
