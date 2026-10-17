import { useCallback } from 'react';
import type { ReportCellFormat } from './columns';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';

const EMPTY_CELL = '–';

/** One formatter for every table cell, so numbers read the same as in tooltips and metric cards. */
export function useCellFormatter() {
  const number = useNumber();
  return useCallback(
    (
      value: number | string | null | undefined,
      format: ReportCellFormat = 'number'
    ): string => {
      if (value === null || value === undefined || value === '') {
        return EMPTY_CELL;
      }
      if (typeof value === 'string') {
        return value;
      }
      switch (format) {
        case 'percent':
          return number.formatWithUnit(value / 100, '%');
        case 'currency':
          return number.currency(value / 100);
        case 'minutes':
          return fancyMinutes(value);
        case 'text':
          return String(value);
        default:
          return number.format(value);
      }
    },
    [number]
  );
}

export function isNumericFormat(format: ReportCellFormat | undefined) {
  return format !== 'text';
}
