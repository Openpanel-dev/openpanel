import { DateTime } from '@openpanel/shared';
import { DEFAULT_TIMEZONE } from '../organization.constants';
import { TIMEZONES } from './timezones';

const CLICKHOUSE_TIMEZONES = new Set(TIMEZONES);

export function resolveDefaultTimezone(
  value: string | undefined,
  warn: (message: string) => void
): string {
  if (!value || value.trim() === '') {
    return DEFAULT_TIMEZONE;
  }
  if (
    DateTime.now().setZone(value).isValid &&
    CLICKHOUSE_TIMEZONES.has(value)
  ) {
    return value;
  }
  warn('Invalid DEFAULT_TIMEZONE, falling back to UTC');
  return DEFAULT_TIMEZONE;
}
