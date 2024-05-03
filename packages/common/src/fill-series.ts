import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  format,
  parseISO,
  startOfDay,
  startOfHour,
  startOfMinute,
  startOfMonth,
} from 'date-fns';

import type { IInterval } from '@openpanel/validation';

// Define the data structure
interface DataEntry {
  label: string;
  count: number | null;
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
    case 'month':
      return startOfMonth(date);
    default:
      return startOfMinute(date);
  }
}

// Function to complete the timeline for each label
export function completeTimeline(
  data: DataEntry[],
  _startDate: string,
  _endDate: string,
  interval: IInterval
) {
  const startDate = parseISO(_startDate);
  const endDate = parseISO(_endDate);
  // Group data by label
  const labelsMap = new Map<string, Map<string, number>>();
  data.forEach((entry) => {
    const roundedDate = roundDate(parseISO(entry.date), interval);
    const dateKey = format(roundedDate, 'yyyy-MM-dd HH:mm:ss');

    if (!labelsMap.has(entry.label)) {
      labelsMap.set(entry.label, new Map());
    }
    const labelData = labelsMap.get(entry.label);
    labelData?.set(dateKey, (labelData.get(dateKey) || 0) + (entry.count || 0));
  });

  // Complete the timeline for each label
  const result: Record<string, DataEntry[]> = {};
  labelsMap.forEach((counts, label) => {
    let currentDate = roundDate(startDate, interval);
    result[label] = [];
    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd HH:mm:ss');
      result[label]!.push({
        label: label,
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
        case 'month':
          currentDate = addMonths(currentDate, 1);
          break;
      }
    }
  });

  return result;
}
