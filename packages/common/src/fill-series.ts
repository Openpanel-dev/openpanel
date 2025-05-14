import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  format,
  parseISO,
  startOfDay,
  startOfHour,
  startOfMinute,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IInterval } from '@openpanel/validation';

// Define the data structure
export interface ISerieDataItem {
  label_0: string | null | undefined;
  label_1?: string | null | undefined;
  label_2?: string | null | undefined;
  label_3?: string | null | undefined;
  count: number;
  date: string;
}

export interface ISerieDataItemComplete {
  labels: string[];
  count: number;
  date: string;
}

// Function to round down the date to the nearest interval
function roundDate(date: Date, interval: IInterval): Date {
  switch (interval) {
    case 'minute':
      return startOfMinute(date);
    case 'hour':
      return startOfHour(date);
    case 'day':
      return startOfDay(date);
    case 'week':
      return startOfWeek(date);
    case 'month':
      return startOfMonth(date);
    default:
      return startOfMinute(date);
  }
}

function filterFalsyAfterTruthy(array: (string | undefined | null)[]) {
  let foundTruthy = false;
  const filtered = array.filter((item) => {
    if (foundTruthy) {
      // After a truthy, filter out falsy values
      return !!item;
    }
    if (item) {
      // Mark when the first truthy is encountered
      foundTruthy = true;
    }
    // Return all elements until the first truthy is found
    return true;
  });

  if (filtered.some((item) => !!item)) {
    return filtered;
  }

  return [null];
}

function concatLabels(entry: ISerieDataItem): string {
  return filterFalsyAfterTruthy([
    entry.label_0,
    entry.label_1,
    entry.label_2,
    entry.label_3,
  ])
    .map((label) => label || NOT_SET_VALUE)
    .join(':::');
}

// Function to complete the timeline for each label
export function completeSerie(
  data: ISerieDataItem[],
  _startDate: string,
  _endDate: string,
  interval: IInterval,
) {
  const startDate = parseISO(_startDate);
  const endDate = parseISO(_endDate);
  // Group data by label
  const labelsMap = new Map<string, Map<string, number>>();
  data.forEach((entry) => {
    const roundedDate = roundDate(parseISO(entry.date), interval);
    const dateKey = format(roundedDate, 'yyyy-MM-dd HH:mm:ss');
    const label = concatLabels(entry) || NOT_SET_VALUE;
    if (!labelsMap.has(label)) {
      labelsMap.set(label, new Map());
    }
    const labelData = labelsMap.get(label)!;
    labelData.set(dateKey, (labelData.get(dateKey) || 0) + (entry.count || 0));
  });

  // Complete the timeline for each label
  const result: Record<string, ISerieDataItemComplete[]> = {};
  labelsMap.forEach((counts, label) => {
    let currentDate = roundDate(startDate, interval);
    result[label] = [];
    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd HH:mm:ss');
      result[label]!.push({
        labels: label.split(':::'),
        date: dateKey,
        count: counts.get(dateKey) || 0,
      });

      // Increment the current date based on the interval
      switch (interval) {
        case 'minute':
          currentDate = addMinutes(currentDate, 1);
          break;
        case 'hour':
          currentDate = addHours(currentDate, 1);
          break;
        case 'day':
          currentDate = addDays(currentDate, 1);
          break;
        case 'week':
          currentDate = addWeeks(currentDate, 1);
          break;
        case 'month':
          currentDate = addMonths(currentDate, 1);
          break;
      }
    }
  });

  return result;
}
