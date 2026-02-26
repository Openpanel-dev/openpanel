import type { IClickhouseEvent, IServiceEvent } from '@openpanel/db';
import { useSuspenseQuery } from '@tanstack/react-query';
import { FilterIcon, XIcon } from 'lucide-react';
import { omit } from 'ramda';
import { Suspense, useState } from 'react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';
import { ProjectLink } from '@/components/links';
import {
  WidgetButtons,
  WidgetHead,
} from '@/components/overview/overview-widget';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import { Button } from '@/components/ui/button';
import { FieldValue, KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget, WidgetBody } from '@/components/widget';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';

interface Props {
  id: string;
  createdAt?: Date;
  projectId: string;
}

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

export default function EventDetails(props: Props) {
  return (
    <ModalContent className="!p-0">
      <Widget className="min-w-0 border-0 bg-transparent">
        <Suspense fallback={<EventDetailsSkeleton />}>
          <EventDetailsContent {...props} />
        </Suspense>
      </Widget>
    </ModalContent>
  );
}

function EventDetailsContent({ id, createdAt, projectId }: Props) {
  const [, setEvents] = useEventQueryNamesFilter();
  const [, setFilter] = useEventQueryFilters();
  const TABS = {
    essentials: {
      id: 'essentials',
      title: 'Essentials',
    },
    detailed: {
      id: 'detailed',
      title: 'Detailed',
    },
  };
  const [widget, setWidget] = useState(TABS.essentials);
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

    if (widget.id === TABS.detailed.id) {
      data.length = 0;
      Object.entries(omit(['properties', 'profile', 'meta'], event)).forEach(
        ([name, value]) => {
          if (!name.startsWith('__')) {
            data.push({
              name: name as keyof IServiceEvent,
              value: value as any,
              event,
            });
          }
        }
      );
    }

    return data.filter((item) => {
      if (widget.id === TABS.essentials.id) {
        return !!item.value;
      }

      return true;
    });
  })();

  const properties = Object.entries(event.properties)
    .filter(([name]) => !name.startsWith('__'))
    .map(([name, value]) => ({
      name,
      value,
      event,
    }));

  return (
    <>
      <WidgetHead>
        <div className="row items-center justify-between">
          <div className="title">{event.name}</div>
          <div className="row items-center gap-2 pr-2">
            {/* <Button
                size="icon"
                variant={'ghost'}
                onClick={() => {
                  const event = new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                  });
                  dispatchEvent(event);
                }}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                variant={'ghost'}
                onClick={() => {
                  const event = new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                  });
                  dispatchEvent(event);
                }}
              >
                <ArrowRightIcon className="size-4" />
              </Button> */}
            <Button onClick={() => popModal()} size="icon" variant={'ghost'}>
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>

        <WidgetButtons>
          {Object.entries(TABS).map(([, tab]) => (
            <button
              className={cn(tab.id === widget.id && 'active')}
              key={tab.id}
              onClick={() => setWidget(tab)}
              type="button"
            >
              {tab.title}
            </button>
          ))}
        </WidgetButtons>
      </WidgetHead>
      <WidgetBody className="col gap-4 bg-def-100">
        {profile && (
          <ProjectLink
            className="card col gap-2 p-4 py-2 hover:bg-def-100"
            href={`/profiles/${encodeURIComponent(profile.id)}`}
            onClick={() => popModal()}
          >
            <div className="row items-center justify-between gap-2">
              <div className="row min-w-0 items-center gap-2">
                {profile.avatar && (
                  <img
                    className="size-4 rounded-full bg-border"
                    src={profile.avatar}
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
              <div className="text-sm">
                This session has {session.screenViewCount} screen views and{' '}
                {session.eventCount} events. Visit duration is{' '}
                {fancyMinutes(session.duration / 1000)}.
              </div>
            )}
          </ProjectLink>
        )}

        {properties.length > 0 && (
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>Properties</div>
            </div>
            <KeyValueGrid
              columns={1}
              data={properties}
              onItemClick={(item) => {
                popModal();
                setFilter(`properties.${item.name}`, item.value as any);
              }}
              renderValue={(item) => (
                <div className="flex items-center gap-2">
                  <span className="font-mono">{String(item.value)}</span>
                  <FilterIcon className="size-3 shrink-0" />
                </div>
              )}
            />
          </section>
        )}
        <section>
          <div className="mb-2 flex justify-between font-medium">
            <div>Information</div>
          </div>
          <KeyValueGrid
            columns={1}
            data={data}
            onItemClick={(item) => {
              const isFilterable = item.value && (filterable as any)[item.name];
              if (isFilterable) {
                popModal();
                setFilter(item.name as keyof IServiceEvent, item.value);
              }
            }}
            renderValue={(item) => {
              const isFilterable = item.value && (filterable as any)[item.name];
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
                <FieldValue event={event} name={item.name} value={item.value} />
              );
            }}
          />
        </section>
        <section>
          <div className="mb-2 flex justify-between font-medium">
            <div>All events for {event.name}</div>
            <button
              className="text-muted-foreground hover:underline"
              onClick={() => {
                setEvents([event.name]);
                popModal();
              }}
              type="button"
            >
              Show all
            </button>
          </div>
          <div className="card p-4">
            <ReportChartShortcut
              chartType="linear"
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
      </WidgetBody>
    </>
  );
}

function EventDetailsSkeleton() {
  return (
    <>
      <WidgetHead>
        <div className="row items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="row items-center gap-2 pr-2">
            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
          </div>
        </div>

        <WidgetButtons>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </WidgetButtons>
      </WidgetHead>
      <WidgetBody className="col gap-4 bg-def-100">
        {/* Profile skeleton */}
        <div className="card col gap-2 p-4 py-2">
          <div className="row items-center justify-between gap-2">
            <div className="row min-w-0 items-center gap-2">
              <div className="size-4 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="row shrink-0 items-center gap-2">
              <div className="row items-center gap-1">
                <div className="size-4 animate-pulse rounded bg-muted" />
                <div className="size-4 animate-pulse rounded bg-muted" />
                <div className="size-4 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>

        {/* Properties skeleton */}
        <section>
          <div className="mb-2 flex justify-between font-medium">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
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

        {/* Information skeleton */}
        <section>
          <div className="mb-2 flex justify-between font-medium">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                className="flex items-center justify-between rounded bg-muted/50 p-3"
                key={i.toString()}
              >
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </section>

        {/* Chart skeleton */}
        <section>
          <div className="mb-2 flex justify-between font-medium">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="card p-4">
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </div>
        </section>
      </WidgetBody>
    </>
  );
}
