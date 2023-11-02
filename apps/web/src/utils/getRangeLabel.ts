import { type IChartRange } from '@/types';

import { timeRanges } from './constants';

export function getRangeLabel(range: IChartRange) {
  return timeRanges.find((item) => item.range === range)?.title ?? null;
}
