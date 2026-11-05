import type { IServiceEvent } from '@openpanel/core';
import { ListTreeIcon, ZapIcon } from 'lucide-react';
import { formatDuration } from '../replay/replay-utils';
import { getElapsedMs, type SessionPageVisit } from './session-pages';
import { EmptyState } from '@/components/empty-state';
import { EventIcon } from '@/components/events/event-icon';
import { useEventDrawer } from '@/components/events/use-event-drawer';
import { WidgetHead, WidgetTitle } from '@/components/overview/overview-widget';
import { Widget } from '@/components/widget';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { formatTime } from '@/utils/date';

const MS_PER_SECOND = 1000;
const MAX_PROPERTY_CHIPS = 3;
const MAX_CHIP_VALUE_LENGTH = 32;

function getPropertyChips(event: IServiceEvent): [string, string][] {
  return Object.entries(event.properties ?? {})
    .filter(
      ([key, value]) =>
        !key.startsWith('__') &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean')
    )
    .slice(0, MAX_PROPERTY_CHIPS)
    .map(([key, value]) => {
      const text = String(value);
      return [
        key,
        text.length > MAX_CHIP_VALUE_LENGTH
          ? `${text.slice(0, MAX_CHIP_VALUE_LENGTH)}…`
          : text,
      ];
    });
}

function Elapsed({ ms }: { ms: number }) {
  return (
    <span className="font-mono text-2xs text-muted-foreground tabular-nums">
      +{formatDuration(ms)}
    </span>
  );
}

function EventRow({
  event,
  sessionStart,
  onOpen,
}: {
  event: IServiceEvent;
  sessionStart: Date;
  onOpen: () => void;
}) {
  const chips = getPropertyChips(event);
  return (
    <li className="relative">
      <span className="absolute top-3.5 left-[-21px] size-2 rounded-full border-2 border-card bg-def-400" />
      <button
        className="row w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-def-100"
        onClick={onOpen}
        type="button"
      >
        <EventIcon meta={event.meta} name={event.name} size="xs" />
        <span className="col min-w-0 flex-1 gap-1">
          <span className="truncate text-sm">
            {event.name.replace(/_/g, ' ')}
          </span>
          {chips.length > 0 && (
            <span className="row flex-wrap gap-1">
              {chips.map(([key, value]) => (
                <span
                  className="max-w-full truncate rounded bg-def-200 px-1.5 py-px font-mono text-2xs"
                  key={key}
                >
                  <span className="text-muted-foreground">{key}</span> {value}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="leading-5">
          <Elapsed ms={getElapsedMs(event, sessionStart)} />
        </span>
      </button>
    </li>
  );
}

function PageHeader({
  visit,
  index,
  sessionStart,
  onOpen,
}: {
  visit: SessionPageVisit;
  index: number;
  sessionStart: Date;
  onOpen?: () => void;
}) {
  const view = visit.view;
  const content = (
    <>
      {view ? (
        <span className="absolute top-1/2 left-[-27px] grid size-5 -translate-y-1/2 place-items-center rounded-full bg-highlight font-semibold text-[10px] text-white ring-4 ring-card">
          {index}
        </span>
      ) : (
        <span className="absolute top-1/2 left-[-22px] size-2.5 -translate-y-1/2 rounded-full bg-def-400 ring-4 ring-card" />
      )}
      <span className="col min-w-0 flex-1">
        <span className="truncate font-semibold">
          {view ? visit.path : 'Session started'}
        </span>
        <span className="text-2xs text-muted-foreground">
          {formatTime(new Date(visit.startedAt))}
          {view &&
            ` · ${fancyMinutes(visit.durationMs / MS_PER_SECOND)} on page`}
        </span>
      </span>
      {view && <Elapsed ms={getElapsedMs(view, sessionStart)} />}
    </>
  );

  if (!onOpen) {
    return (
      <div className="row relative items-center gap-3 px-2 py-2">{content}</div>
    );
  }
  return (
    <button
      className="row relative w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-def-100"
      onClick={onOpen}
      type="button"
    >
      {content}
    </button>
  );
}

export function SessionTimeline({
  visits,
  sessionStart,
}: {
  visits: SessionPageVisit[];
  sessionStart: Date;
}) {
  const { openEvent } = useEventDrawer();
  const open = (event: IServiceEvent) =>
    openEvent({ id: event.id, createdAt: event.createdAt });
  let pageNumber = 0;

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={ListTreeIcon}>Timeline</WidgetTitle>
      </WidgetHead>
      {visits.length === 0 ? (
        <EmptyState
          description="This session has no events in it."
          icon={ZapIcon}
          title="No events"
          variant="inline"
        />
      ) : (
        <ol className="col gap-1 py-3 pr-3 pl-10">
          {visits.map((visit, index) => {
            const view = visit.view;
            if (view) {
              pageNumber++;
            }
            return (
              <li
                className="relative before:absolute before:top-0 before:bottom-0 before:left-[-17px] before:w-px before:bg-border first:before:top-5 last:before:bottom-auto last:before:h-5"
                key={view?.id ?? `pre-${index}`}
              >
                <PageHeader
                  index={pageNumber}
                  onOpen={view ? () => open(view) : undefined}
                  sessionStart={sessionStart}
                  visit={visit}
                />
                {visit.events.length > 0 && (
                  <ul className="col gap-0.5 pb-2">
                    {visit.events.map((event) => (
                      <EventRow
                        event={event}
                        key={event.id}
                        onOpen={() => open(event)}
                        sessionStart={sessionStart}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Widget>
  );
}
