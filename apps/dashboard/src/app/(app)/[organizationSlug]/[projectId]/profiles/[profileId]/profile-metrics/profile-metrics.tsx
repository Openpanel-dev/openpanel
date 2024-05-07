'use client';

import { useNumber } from '@/hooks/useNumerFormatter';
import { formatDistanceToNow } from 'date-fns';

import type { IProfileMetrics } from '@openpanel/db';

type Props = {
  data: IProfileMetrics;
};

const ProfileMetrics = ({ data }: Props) => {
  const number = useNumber();
  return (
    <div className="flex flex-wrap gap-6 whitespace-nowrap md:justify-end md:text-right">
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          First seen
        </div>
        <div className="text-lg font-semibold">
          {formatDistanceToNow(data.firstSeen)}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          Last seen
        </div>
        <div className="text-lg font-semibold">
          {formatDistanceToNow(data.lastSeen)}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          Sessions
        </div>
        <div className="text-lg font-semibold">
          {number.format(data.sessions)}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          Avg. Session
        </div>
        <div className="text-lg font-semibold">
          {number.formatWithUnit(data.durationAvg / 1000, 'min')}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          P90. Session
        </div>
        <div className="text-lg font-semibold">
          {number.formatWithUnit(data.durationP90 / 1000, 'min')}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted-foreground">
          Page views
        </div>
        <div className="text-lg font-semibold">
          {number.format(data.screenViews)}
        </div>
      </div>
    </div>
  );
};

export default ProfileMetrics;
