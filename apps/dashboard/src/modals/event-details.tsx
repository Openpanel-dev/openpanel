import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';

import { EventFieldValue } from '@/components/events/event-field-value';
import { ProjectLink } from '@/components/links';
import {
  WidgetButtons,
  WidgetHead,
} from '@/components/overview/overview-widget';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import { fancyMinutes } from '@/hooks/useNumerFormatter';
import { camelCaseToWords } from '@/utils/casing';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import type { IClickhouseEvent, IServiceEvent } from '@openpanel/db';
import { ArrowLeftIcon, ArrowRightIcon, FilterIcon, XIcon } from 'lucide-react';
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
  const [{ event, session }] = api.event.details.useSuspenseQuery({
    id,
    projectId,
    createdAt,
  });

  const profile = event.profile;

  const data = (() => {
    const data: { name: keyof IServiceEvent; value: any }[] = [
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
    ];

    if (widget.id === TABS.detailed.id) {
      data.length = 0;
      Object.entries(omit(['properties', 'profile', 'meta'], event)).forEach(
        ([name, value]) => {
          if (!name.startsWith('__')) {
            data.push({
              name: name as keyof IServiceEvent,
              value: value as any,
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
      name: name as keyof IServiceEvent,
      value: value,
    }));

  return (
    <ModalContent className="!p-0">
      <Widget className="bg-transparent border-0 min-w-0">
        <WidgetHead>
          <div className="row items-center justify-between">
            <div className="title">{event.name}</div>
            <div className="row items-center gap-2 pr-2">
              <Button
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
              </Button>
              <Button size="icon" variant={'ghost'} onClick={() => popModal()}>
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>

          <WidgetButtons>
            {Object.entries(TABS).map(([key, tab]) => (
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
              onClick={(e) => popModal()}
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
                  This session has {session.screen_view_count} screen views and{' '}
                  {session.event_count} events. Visit duration is{' '}
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
              <WidgetTable
                className={'card [&>div:first-child]:hidden'}
                columnClassName="[&_.cell:first-child]:pl-4 [&_.cell:last-child]:pr-4 h-auto"
                data={properties}
                keyExtractor={(item) => item.name}
                columns={[
                  {
                    name: 'Name',
                    className: 'text-left',
                    width: 'auto',
                    render(item) {
                      const splitKey = item.name.split('.');
                      return (
                        <div className="row items-center gap-2">
                          {splitKey.map((name, index) => (
                            <div
                              key={name}
                              className={
                                index === splitKey.length - 1
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              }
                            >
                              {camelCaseToWords(name)}
                            </div>
                          ))}
                        </div>
                      );
                    },
                  },
                  {
                    name: 'Value',
                    className: 'text-right font-mono font-medium',
                    width: 'w-full',
                    render(item) {
                      return (
                        <button
                          className="row items-center gap-2 text-right"
                          type="button"
                          onClick={() => {
                            popModal();
                            setFilter(
                              `properties.${item.name}`,
                              item.value as any,
                            );
                          }}
                        >
                          <EventFieldValue
                            name={item.name}
                            value={item.value}
                            event={event}
                          />
                          <FilterIcon className="size-3 shrink-0" />
                        </button>
                      );
                    },
                  },
                ]}
              />
            </section>
          )}
          <section>
            <div className="mb-2 flex justify-between font-medium">
              <div>Information</div>
            </div>
            <WidgetTable
              className={'card [&>div:first-child]:hidden'}
              columnClassName="[&_.cell:first-child]:pl-4 [&_.cell:last-child]:pr-4 h-auto"
              data={data}
              keyExtractor={(item) => item.name}
              columns={[
                {
                  name: 'Name',
                  className: 'text-left',
                  width: 'auto',
                  render(item) {
                    const splitKey = item.name.split('.');
                    return (
                      <div className="row items-center gap-2">
                        {splitKey.map((name, index) => (
                          <div
                            key={name}
                            className={
                              index === splitKey.length - 1
                                ? 'text-foreground'
                                : 'text-muted-foreground'
                            }
                          >
                            {camelCaseToWords(name)}
                          </div>
                        ))}
                      </div>
                    );
                  },
                },
                {
                  name: 'Value',
                  className: 'text-right font-mono font-medium',
                  width: 'w-full',
                  render(item) {
                    if (item.value && filterable[item.name]) {
                      return (
                        <button
                          className="row items-center gap-2 text-right"
                          type="button"
                          onClick={() => {
                            popModal();
                            setFilter(item.name, item.value);
                          }}
                        >
                          <EventFieldValue
                            name={item.name}
                            value={item.value}
                            event={event}
                          />
                          <FilterIcon className="size-3 shrink-0" />
                        </button>
                      );
                    }

                    return (
                      <EventFieldValue
                        name={item.name}
                        value={item.value}
                        event={event}
                      />
                    );
                  },
                },
              ]}
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
