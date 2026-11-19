import { DateTime } from 'luxon';

/** Formats display time without changing the process or business timezone. */
export function getLogTimestamp(timezone: string): string {
  const timestamp = DateTime.now().setZone(timezone);
  return (timestamp.isValid ? timestamp : DateTime.utc()).toFormat(
    'yyyy-MM-dd HH:mm:ss.SSSZZ'
  );
}
