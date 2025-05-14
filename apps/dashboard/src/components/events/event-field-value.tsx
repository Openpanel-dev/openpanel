import { fancyMinutes } from '@/hooks/useNumerFormatter';
import { formatDateTime, formatTime } from '@/utils/date';
import type { IServiceEvent } from '@openpanel/db';
import { isToday } from 'date-fns';
import { SerieIcon } from '../report-chart/common/serie-icon';

export function EventFieldValue({
  name,
  value,
  event,
}: {
  name: keyof IServiceEvent;
  value: any;
  event: IServiceEvent;
}) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isToday(value) ? formatTime(value) : formatDateTime(value);
  }

  switch (name) {
    case 'osVersion':
      return (
        <div className="row gap-2 items-center">
          <SerieIcon name={event.os} />
          <span>{value}</span>
        </div>
      );
    case 'browserVersion':
      return (
        <div className="row gap-2 items-center">
          <SerieIcon name={event.browser} />
          <span>{value}</span>
        </div>
      );
    case 'city':
      return (
        <div className="row gap-2 items-center">
          <SerieIcon name={event.country} />
          <span>{value}</span>
        </div>
      );
    case 'region':
      return (
        <div className="row gap-2 items-center">
          <SerieIcon name={event.country} />
          <span>{value}</span>
        </div>
      );
    case 'properties':
      return JSON.stringify(value);
    case 'country':
    case 'browser':
    case 'os':
    case 'brand':
    case 'model':
    case 'device':
      return (
        <div className="row gap-2 items-center">
          <SerieIcon name={value} />
          <span>{value}</span>
        </div>
      );
    case 'duration':
      return (
        <div className="text-right">
          <span className="text-muted-foreground">({value}ms)</span>{' '}
          {fancyMinutes(value / 1000)}
        </div>
      );
    default:
      return value;
  }
}
