import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/use-event-query-filters';

import { ProjectLink } from '@/components/links';
import {
  WidgetButtons,
  WidgetHead,
} from '@/components/overview/overview-widget';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Button } from '@/components/ui/button';
import { FieldValue, KeyValueGrid } from '@/components/ui/key-value-grid';
import { Widget, WidgetBody } from '@/components/widget';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import type { IClickhouseEvent, IServiceEvent } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { FilterIcon, XIcon } from 'lucide-react';
import { omit } from 'ramda';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';

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

export default function EventDetails({ id, createdAt, projectId }: Props) {
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
  const query = useQuery(
    trpc.event.details.queryOptions({
      id,
      projectId,
      createdAt,
    }),
  );

  if (!query.data) {
    return <EventDetailsSkeleton />;
  }

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
        },
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
    <ModalContent className="!p-0">
      <Widget className="bg-transparent border-0 min-w-0">
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
              <Button size="icon" variant={'ghost'} onClick={() => popModal()}>
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          <WidgetButtons>
            {Object.entries(TABS).map(([, tab]) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWidget(tab)}
                className={cn(tab.id === widget.id && 'active')}
              >
                {tab.title}
              </button>
            ))}
          </WidgetButtons>
        </WidgetHead>
        <WidgetBody className="col gap-4 bg-def-100">
          {profile && (
            <ProjectLink
              onClick={() => popModal()}
              href={`/profiles/${profile.id}`}
              className="card p-4 py-2 col gap-2 hover:bg-def-100"
            >
              <div className="row items-center gap-2 justify-between">
                <div className="row items-center gap-2 min-w-0">
                  {profile.avatar && (
                    <img
                      className="size-4 bg-border rounded-full"
                      src={profile.avatar}
                    />
                  )}
                  <div className="font-medium truncate">
                    {getProfileName(profile, false)}
                  </div>
                </div>
                <div className="row items-center gap-2 shrink-0">
                  <div className="row gap-1 items-center">
                    <SerieIcon name={event.country} />
                    <SerieIcon name={event.os} />
                    <SerieIcon name={event.browser} />
                  </div>
                  <div className="text-muted-foreground truncate max-w-40">
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
                renderValue={(item) => (
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{String(item.value)}</span>
                    <FilterIcon className="size-3 shrink-0" />
                  </div>
                )}
                onItemClick={(item) => {
                  popModal();
                  setFilter(`properties.${item.name}`, item.value as any);
                }}
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
              renderValue={(item) => {
                const isFilterable =
                  item.value && (filterable as any)[item.name];
                if (isFilterable) {
                  return (
                    <div className="flex items-center gap-2">
                      <FieldValue
                        name={item.name}
                        value={item.value}
                        event={event}
                      />
                      <FilterIcon className="size-3 shrink-0" />
                    </div>
                  );
                }

                return (
                  <FieldValue
                    name={item.name}
                    value={item.value}
                    event={event}
                  />
                );
              }}
              onItemClick={(item) => {
                const isFilterable =
                  item.value && (filterable as any)[item.name];
                if (isFilterable) {
                  popModal();
                  setFilter(item.name as keyof IServiceEvent, item.value);
                }
              }}
            />
          </section>
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>All events for {event.name}</div>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => {
                  setEvents([event.name]);
                  popModal();
                }}
              >
                Show all
              </button>
            </div>
            <div className="card p-4">
              <ReportChartShortcut
                projectId={event.projectId}
                chartType="linear"
                events={[
                  {
                    id: 'A',
                    name: event.name,
                    displayName: 'Similar events',
                    segment: 'event',
                    filters: [],
                  },
                ]}
              />
            </div>
          </section>
        </WidgetBody>
      </Widget>
    </ModalContent>
  );
}

function EventDetailsSkeleton() {
  return (
    <ModalContent className="!p-0">
      <Widget className="bg-transparent border-0 min-w-0">
        <WidgetHead>
          <div className="row items-center justify-between">
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            <div className="row items-center gap-2 pr-2">
              <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              <div className="h-8 w-8 bg-muted animate-pulse rounded" />
              <div className="h-8 w-8 bg-muted animate-pulse rounded" />
            </div>
          </div>

          <WidgetButtons>
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
          </WidgetButtons>
        </WidgetHead>
        <WidgetBody className="col gap-4 bg-def-100">
          {/* Profile skeleton */}
          <div className="card p-4 py-2 col gap-2">
            <div className="row items-center gap-2 justify-between">
              <div className="row items-center gap-2 min-w-0">
                <div className="size-4 bg-muted animate-pulse rounded-full" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="row items-center gap-2 shrink-0">
                <div className="row gap-1 items-center">
                  <div className="size-4 bg-muted animate-pulse rounded" />
                  <div className="size-4 bg-muted animate-pulse rounded" />
                  <div className="size-4 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
            <div className="h-4 w-64 bg-muted animate-pulse rounded" />
          </div>

          {/* Properties skeleton */}
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div className="h-5 w-20 bg-muted animate-pulse rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i.toString()}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded"
                >
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </section>

          {/* Information skeleton */}
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i.toString()}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded"
                >
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </section>

          {/* Chart skeleton */}
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div className="h-5 w-40 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
            <div className="card p-4">
              <div className="h-32 w-full bg-muted animate-pulse rounded" />
            </div>
          </section>
        </WidgetBody>
      </Widget>
    </ModalContent>
  );
}
