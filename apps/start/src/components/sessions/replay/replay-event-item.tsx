import type { IServiceEvent } from '@openpanel/core';
import { formatDuration, getEventLabel } from './replay-utils';
import { EventIcon } from '@/components/events/event-icon';
import { cn } from '@/utils/cn';

const MAX_PROPERTY_CHIPS = 2;
const MAX_CHIP_VALUE_LENGTH = 24;

export type ReplayItemState = 'past' | 'current' | 'future';

function getPropertyChips(event: IServiceEvent): string[] {
  return Object.entries(event.properties ?? {})
    .filter(
      ([key, value]) =>
        !key.startsWith('__') &&
        (typeof value === 'string' || typeof value === 'number')
    )
    .slice(0, MAX_PROPERTY_CHIPS)
    .map(([key, value]) => {
      const text = String(value);
      const shortened =
        text.length > MAX_CHIP_VALUE_LENGTH
          ? `${text.slice(0, MAX_CHIP_VALUE_LENGTH)}…`
          : text;
      return `${key}: ${shortened}`;
    });
}

export function ReplayEventItem({
  event,
  offsetMs,
  state,
  onClick,
}: {
  event: IServiceEvent;
  offsetMs: number;
  state: ReplayItemState;
  onClick: () => void;
}) {
  const isPageView = event.name === 'screen_view';
  const chips = isPageView ? [] : getPropertyChips(event);

  return (
    <button
      className={cn(
        'group row relative w-full items-start gap-2.5 py-1.5 pr-3 text-left transition-all duration-300',
        isPageView ? 'pl-3' : 'pl-7',
        state === 'future' && 'opacity-35 hover:opacity-80',
        state === 'current' && 'bg-highlight/[0.07]'
      )}
      data-replay-state={state}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-0.5 rounded-r bg-highlight transition-opacity',
          state === 'current' ? 'opacity-100' : 'opacity-0'
        )}
      />
      <EventIcon
        className="mt-px"
        meta={event.meta}
        name={event.name}
        size={isPageView ? 'sm' : 'xs'}
      />
      <span className="col min-w-0 flex-1 gap-1">
        <span
          className={cn(
            'truncate group-hover:text-foreground',
            isPageView ? 'font-semibold text-sm' : 'text-foreground/80 text-sm',
            isPageView && 'leading-6'
          )}
        >
          {getEventLabel(event)}
        </span>
        {chips.length > 0 && (
          <span className="row flex-wrap gap-1">
            {chips.map((chip) => (
              <span
                className="max-w-full truncate rounded bg-def-200 px-1.5 py-px font-mono text-2xs text-muted-foreground"
                key={chip}
              >
                {chip}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        className={cn(
          'shrink-0 font-mono text-2xs tabular-nums',
          isPageView ? 'leading-6' : 'leading-5',
          state === 'current' ? 'text-highlight' : 'text-muted-foreground'
        )}
      >
        {formatDuration(Math.max(0, offsetMs))}
      </span>
    </button>
  );
}
