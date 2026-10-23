import type { IClickhouseEvent, IServiceEvent } from '@openpanel/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { FilterIcon, XIcon } from 'lucide-react';
import { omit } from 'ramda';
import { Suspense, useEffect, useState } from 'react';
import { useEventDrawer } from './use-event-drawer';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProjectLink } from '@/components/links';
import {
  WidgetButtons,
  WidgetHead,
} from '@/components/overview/overview-widget';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import Syntax from '@/components/syntax';
import { Button } from '@/components/ui/button';
import { FieldValue, KeyValueGrid } from '@/components/ui/key-value-grid';
import { WidgetBody } from '@/components/widget';
import { useAppParams } from '@/hooks/use-app-params';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { useResizableDrawer } from '@/hooks/use-resizable-drawer';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';

const WIDTH_STORAGE_KEY = 'op-event-drawer-width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 380;
const MAX_WIDTH = 800;

const filterable: Partial<Record<keyof IServiceEvent, keyof IClickhouseEvent>> =
  {
    name: 'name',
    referrer: 'referrer',
    referrerName: 'referrer_name',
    referrerType: 'referrer_type',
    brand: 'brand',
    model: 'model',
    browser: 'browser',
    browserVersion: 'browser_version',
    os: 'os',
    osVersion: 'os_version',
    city: 'city',
    region: 'region',
    country: 'country',
    device: 'device',
    properties: 'properties',
    path: 'path',
    origin: 'origin',
  };

const TABS = {
  pretty: { id: 'pretty', title: 'Pretty' },
  raw: { id: 'raw', title: 'Raw' },
} as const;
type Tab = (typeof TABS)[keyof typeof TABS];

/**
 * Right-side drawer for one event. Mounts once in `_app.tsx` next to the chat
 * drawer and, like it, pushes the page content aside on `lg+` instead of
 * covering it, so the list stays usable while stepping through events.
 */
export function EventDrawer() {
  const { projectId } = useAppParams();
  const { eventId, createdAt, chatId, closeEvent } = useEventDrawer();
  const { width, dragHandleProps } = useResizableDrawer({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: WIDTH_STORAGE_KEY,
  });
  const isOpen = Boolean(projectId && eventId);

  // The chat drawer owns the same edge; it wins when it opens on top of us.
  useEffect(() => {
    if (isOpen && chatId !== null) {
      closeEvent({ history: 'replace' });
    }
  }, [isOpen, chatId, closeEvent]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    // Radix overlays (sheets, dialogs, menus) handle Escape themselves; an
    // Escape meant for one of them must not also close the drawer beneath.
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) {
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      const insideOverlay = target?.closest(
        '[role="dialog"], [role="menu"], [role="listbox"]'
      );
      const overlayOpen = document.querySelector(
        '[role="dialog"][data-state="open"]'
      );
      if (insideOverlay || overlayOpen) {
        return;
      }
      closeEvent();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeEvent]);

  if (!(projectId && eventId)) {
    return null;
  }

  return (
    <>
      {/* The aside is `fixed`; this spacer makes the page shrink on `lg+`. */}
      <div aria-hidden className="hidden shrink-0 lg:block" style={{ width }} />
      <aside
        aria-label="Event details"
        className="fixed top-0 right-0 z-40 flex h-screen flex-col border-l bg-background shadow-2xl"
        style={{ width }}
      >
        <div
          aria-label="Resize event details"
          aria-valuemax={MAX_WIDTH}
          aria-valuemin={MIN_WIDTH}
          aria-valuenow={width}
          className="absolute top-0 left-0 z-10 h-full w-1 cursor-ew-resize transition-colors hover:bg-border"
          {...dragHandleProps}
          role="separator"
        />
        <ErrorBoundary
          fallback={(error) => (
            <EventDetailsError message={error.message} onClose={closeEvent} />
          )}
          key={`${projectId}:${eventId}:${createdAt?.toISOString() ?? ''}`}
        >
          <Suspense fallback={<EventDetailsSkeleton onClose={closeEvent} />}>
            <EventDetailsContent
              createdAt={createdAt}
              id={eventId}
              onClose={closeEvent}
              projectId={projectId}
            />
          </Suspense>
        </ErrorBoundary>
      </aside>
    </>
  );
}

interface ContentProps {
  id: string;
  createdAt?: Date;
  projectId: string;
  onClose: () => void;
}

function EventDetailsContent({
  id,
  createdAt,
  projectId,
  onClose,
}: ContentProps) {
  const [, setEvents] = useEventQueryNamesFilter();
  const [, setFilter] = useEventQueryFilters();
  const [tab, setTab] = useState<Tab>(TABS.pretty);
  const trpc = useTRPC();
  const query = useSuspenseQuery(
    trpc.event.details.queryOptions({
      id,
      projectId,
      createdAt,
    })
  );

  const { event, session } = query.data;

  const profile = event.profile;

  const data = (() => {
    const data: {
      name: keyof IServiceEvent | string;
      value: any;
      event: IServiceEvent;
    }[] = [
      {
        name: 'createdAt',
        value: event.createdAt,
      },
      {
        name: 'name',
        value: event.name,
      },
      {
        name: 'origin',
        value: event.origin,
      },
      {
        name: 'path',
        value: event.path,
      },
      {
        name: 'country',
        value: event.country,
      },
      {
        name: 'region',
        value: event.region,
      },
      {
        name: 'city',
        value: event.city,
      },
      {
        name: 'referrer',
        value: event.referrer,
      },
      {
        name: 'referrerName',
        value: event.referrerName,
      },
      {
        name: 'referrerType',
        value: event.referrerType,
      },
      {
        name: 'brand',
        value: event.brand,
      },
      {
        name: 'model',
        value: event.model,
      },
    ].map((item) => ({ ...item, event }));

    return data.filter((item) => !!item.value);
  })();

  const properties = Object.entries(event.properties)
    .filter(([name]) => !name.startsWith('__'))
    .map(([name, value]) => ({
      name,
      value,
      event,
    }));
  // The profile has its own card above; everything else is the event as the API returns it.
  const eventJson = JSON.stringify(omit(['profile'], event), null, 2);

  return (
    <>
      <WidgetHead className="shrink-0 rounded-none">
        <div className="row items-center justify-between">
          <div className="title truncate">{event.name}</div>
          <div className="row items-center gap-2 pr-2">
            <Button
              aria-label="Close event details"
              onClick={onClose}
              size="icon"
              variant={'ghost'}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>

        <WidgetButtons>
          {Object.values(TABS).map((item) => (
            <button
              aria-pressed={item.id === tab.id}
              className={cn(item.id === tab.id && 'active')}
              key={item.id}
              onClick={() => setTab(item)}
              type="button"
            >
              {item.title}
            </button>
          ))}
        </WidgetButtons>
      </WidgetHead>
      <WidgetBody className="col flex-1 gap-4 overflow-y-auto bg-def-100">
        {tab.id === TABS.raw.id && <Syntax code={eventJson} language="json" />}
        {tab.id === TABS.pretty.id && profile && (
          <ProjectLink
            className="card col gap-2 p-4 py-2 hover:bg-def-100"
            params={{ profileId: profile.id }}
            to="/profiles/$profileId"
          >
            <div className="row items-center justify-between gap-2">
              <div className="row min-w-0 items-center gap-2">
                {profile.avatar && (
                  <img
                    alt=""
                    className="size-4 rounded-full bg-border"
                    height={16}
                    src={profile.avatar}
                    width={16}
                  />
                )}
                <div className="truncate font-medium">
                  {getProfileName(profile, false)}
                </div>
              </div>
              <div className="row shrink-0 items-center gap-2">
                <div className="row items-center gap-1">
                  <SerieIcon name={event.country} />
                  <SerieIcon name={event.os} />
                  <SerieIcon name={event.browser} />
                </div>
                <div className="max-w-40 truncate text-muted-foreground">
                  {event.referrerName || event.referrer}
                </div>
              </div>
            </div>
            {!!session && (
              <div className="text-muted-foreground">
                This session has{' '}
                <span className="font-medium text-foreground">
                  {session.screenViewCount} screen views
                </span>{' '}
                and{' '}
                <span className="font-medium text-foreground">
                  {session.eventCount} events
                </span>
                . Visit duration is{' '}
                <span className="font-medium text-foreground">
                  {fancyMinutes(session.duration / 1000)}
                </span>
                .
              </div>
            )}
          </ProjectLink>
        )}

        {tab.id === TABS.pretty.id && properties.length > 0 && (
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>Properties</div>
            </div>
            <KeyValueGrid
              columns={1}
              copyable
              data={properties}
              onItemClick={(item) => {
                setFilter(`properties.${item.name}`, item.value as any);
              }}
              renderValue={(item) => (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{String(item.value)}</span>
                  <FilterIcon className="size-3 shrink-0" />
                </div>
              )}
            />
          </section>
        )}
        {tab.id === TABS.pretty.id && (
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>Information</div>
            </div>
            <KeyValueGrid
              columns={1}
              copyable
              data={data}
              onItemClick={(item) => {
                const isFilterable =
                  item.value && (filterable as any)[item.name];
                if (isFilterable) {
                  setFilter(item.name as keyof IServiceEvent, item.value);
                }
              }}
              renderValue={(item) => {
                const isFilterable =
                  item.value && (filterable as any)[item.name];
                if (isFilterable) {
                  return (
                    <div className="flex items-center gap-2">
                      <FieldValue
                        event={event}
                        name={item.name}
                        value={item.value}
                      />
                      <FilterIcon className="size-3 shrink-0" />
                    </div>
                  );
                }

                return (
                  <FieldValue
                    event={event}
                    name={item.name}
                    value={item.value}
                  />
                );
              }}
            />
          </section>
        )}
        {tab.id === TABS.pretty.id && (
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>All events for {event.name}</div>
              <button
                className="text-muted-foreground hover:underline"
                onClick={() => {
                  setEvents([event.name]);
                }}
                type="button"
              >
                Show all
              </button>
            </div>
            <div className="card p-4">
              <ReportChartShortcut
                chartType="linear"
                options={{ hideTable: true }}
                projectId={event.projectId}
                series={[
                  {
                    id: 'A',
                    name: event.name,
                    displayName: 'Similar events',
                    segment: 'event',
                    filters: [],
                    type: 'event',
                  },
                ]}
              />
            </div>
          </section>
        )}
      </WidgetBody>
    </>
  );
}

function EventDetailsError({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <>
      <WidgetHead className="shrink-0 rounded-none">
        <div className="row items-center justify-between">
          <div className="p-4 font-semibold">Event details</div>
          <div className="row items-center gap-2 pr-2">
            <Button
              aria-label="Close event details"
              onClick={onClose}
              size="icon"
              variant={'ghost'}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
      </WidgetHead>
      <WidgetBody className="col flex-1 gap-2 bg-def-100">
        <div className="card p-4">
          <div className="font-medium">This event could not be loaded</div>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
      </WidgetBody>
    </>
  );
}

function EventDetailsSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <WidgetHead className="shrink-0 rounded-none">
        <div className="row items-center justify-between">
          <div className="p-4">
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="row items-center gap-2 pr-2">
            <Button
              aria-label="Close event details"
              onClick={onClose}
              size="icon"
              variant={'ghost'}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>

        <WidgetButtons>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </WidgetButtons>
      </WidgetHead>
      <WidgetBody className="col flex-1 gap-4 overflow-y-auto bg-def-100">
        <div className="card col gap-2 p-4 py-2">
          <div className="row items-center justify-between gap-2">
            <div className="row min-w-0 items-center gap-2">
              <div className="size-4 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>

        {[3, 6].map((rowCount) => (
          <section key={rowCount}>
            <div className="mb-2 flex justify-between font-medium">
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: rowCount }).map((_, i) => (
                <div
                  className="flex items-center justify-between rounded bg-muted/50 p-3"
                  key={i.toString()}
                >
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </WidgetBody>
    </>
  );
}
