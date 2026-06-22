import { timeWindows } from '@openpanel/constants';

export const timeWindowLabelKeys = {
  '30min': 'ui.time_window_30min',
  lastHour: 'ui.time_window_last_hour',
  last24h: 'ui.time_window_last_24h',
  today: 'ui.time_window_today',
  yesterday: 'ui.time_window_yesterday',
  '7d': 'ui.time_window_7d',
  '30d': 'ui.time_window_30d',
  '3m': 'ui.time_window_3m',
  '6m': 'ui.time_window_6m',
  '12m': 'ui.time_window_12m',
  monthToDate: 'ui.time_window_month_to_date',
  lastMonth: 'ui.time_window_last_month',
  yearToDate: 'ui.time_window_year_to_date',
  lastYear: 'ui.time_window_last_year',
  custom: 'ui.time_window_custom',
} satisfies Record<keyof typeof timeWindows, string>;

export function getTimeWindowLabelKey(range: string): string | null {
  if (range in timeWindowLabelKeys) {
    return timeWindowLabelKeys[range as keyof typeof timeWindowLabelKeys];
  }

  return null;
}
