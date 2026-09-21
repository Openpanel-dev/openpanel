import type { IServiceEvent } from '@openpanel/core';
import { EventIcon } from '@/components/events/event-icon';
import { cn } from '@/lib/utils';

function formatTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function ReplayEventItem({
  event,
  isCurrent,
  onClick,
}: {
  event: IServiceEvent;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const displayName =
    event.name === 'screen_view' && event.path
      ? event.path
      : event.name.replace(/_/g, ' ');

  return (
    <button
      className={cn(
        'col w-full gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-accent',
        isCurrent ? 'bg-accent/10' : 'bg-card'
      )}
      onClick={onClick}
      type="button"
    >
      <div className="row items-center gap-2">
        <div className="flex-shrink-0">
          <EventIcon meta={event.meta} name={event.name} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">
            {displayName}
          </div>
        </div>
        <span className="flex-shrink-0 text-muted-foreground text-xs tabular-nums">
          {formatTime(event.createdAt)}
        </span>
      </div>
    </button>
  );
}
