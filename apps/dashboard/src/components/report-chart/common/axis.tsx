import { useDebounceFn } from '@/hooks/useDebounceFn';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { isNil } from 'ramda';
import { useRef, useState } from 'react';
import type { AxisDomain } from 'recharts/types/util/types';

import type { IInterval } from '@openpanel/validation';

export const AXIS_FONT_PROPS = {
  fontSize: 8,
  className: 'font-mono',
};

export function getYAxisWidth(value: string | undefined | null) {
  const charLength = AXIS_FONT_PROPS.fontSize * 0.6;

  if (isNil(value) || value.length === 0) {
    return charLength * 2;
  }

  return charLength * value.length + charLength;
}

export const useYAxisProps = (options?: {
  hide?: boolean;
  tickFormatter?: (value: number) => string;
}) => {
  const [width, setWidth] = useState(24);
  const setWidthDebounced = useDebounceFn(setWidth, 100);
  const number = useNumber();
  const ref = useRef<number[]>([]);

  return {
    ...AXIS_FONT_PROPS,
    width: options?.hide ? 0 : width,
    axisLine: false,
    tickLine: false,
    allowDecimals: false,
    tickFormatter: (value: number) => {
      const tick = options?.tickFormatter
        ? options.tickFormatter(value)
        : number.short(value);
      const newWidth = getYAxisWidth(tick);
      ref.current.push(newWidth);
      setWidthDebounced(Math.max(...ref.current));
      return tick;
    },
  };
};

export const useXAxisProps = (
  {
    interval = 'auto',
    hide,
  }: {
    interval?: IInterval | 'auto';
    hide?: boolean;
  } = {
    hide: false,
    interval: 'auto',
  },
) => {
  const formatDate = useFormatDateInterval(
    interval === 'auto' ? 'day' : interval,
  );
  return {
    height: hide ? 0 : 14,
    tickSize: 10,
    axisLine: false,
    dataKey: 'timestamp',
    scale: 'utc',
    domain: ['dataMin', 'dataMax'] as AxisDomain,
    tickFormatter:
      interval === 'auto'
        ? undefined
        : (m: string) => {
            if (['dataMin', 'dataMax'].includes(m)) {
              return m;
            }

            return formatDate(new Date(m));
          },
    type: 'number' as const,
    tickLine: false,
    minTickGap: 20,
    ...AXIS_FONT_PROPS,
  } as const;
};
