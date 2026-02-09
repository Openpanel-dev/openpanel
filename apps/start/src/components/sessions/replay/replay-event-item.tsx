'use client';

import { EventIcon } from '@/components/events/event-icon';
import { cn } from '@/lib/utils';
import type { IServiceEvent } from '@openpanel/db';

function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

export function ReplayEventItem({
  event,
  offsetMs,
  isCurrent,
  onClick,
}: {
  event: IServiceEvent;
  offsetMs: number;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const displayName =
    event.name === 'screen_view' && event.path
      ? event.path
      : event.name.replace(/_/g, ' ');

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'col w-full gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-accent bg-card',
        isCurrent ? 'bg-accent/10' : 'bg-card',
      )}
    >
      <div className="row items-center gap-2">
        <div className="flex-shrink-0">
          <EventIcon name={event.name} meta={event.meta} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">
            {displayName}
          </div>
        </div>
        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatOffset(offsetMs)}
        </span>
      </div>
    </button>
  );
}
