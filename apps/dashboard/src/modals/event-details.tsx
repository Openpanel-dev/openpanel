import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import { KeyValue } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';
import { round } from 'mathjs';

import { SerieName } from '@/components/report-chart/common/serie-name';
import { Button } from '@/components/ui/button';
import { WidgetTable } from '@/components/widget-table';
import { useNumber } from '@/hooks/useNumerFormatter';
import { formatDate, formatDateTime } from '@/utils/date';
import { FilterIcon } from 'lucide-react';
import { isNil, omit } from 'ramda';
import { useMemo, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface Props {
  id: string;
  createdAt?: Date;
  projectId: string;
}

const filterable = {
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
};

export default function EventDetails({ id, createdAt, projectId }: Props) {
  const [, setEvents] = useEventQueryNamesFilter();
  const [, setFilter] = useEventQueryFilters();
  const [showNullable, setShowNullable] = useLocalStorage(
    '@op:event-details-show-nullable',
    false,
  );
  const number = useNumber();
  const query = api.event.byId.useQuery({ id, projectId, createdAt });

  if (query.isLoading || query.isFetching) {
    return null;
  }

  if (query.isError || !query.isSuccess) {
    return null;
  }

  const event = query.data;

  const data = (() => {
    const data = Object.entries(omit(['properties'], event)).map(
      ([name, value]) => ({
        name: [name],
        value: value as string | number | undefined,
      }),
    );

    Object.entries(event.properties).forEach(([name, value]) => {
      data.push({
        name: ['properties', ...name.split('.')],
        value: value as string | number | undefined,
      });
    });

    return data.filter((item) => {
      if (showNullable) {
        return true;
      }

      return !!item.value;
    });
  })();

  return (
    <ModalContent>
      <ModalHeader title={event.name} />
      <div className="-mx-2 mb-8">
        <WidgetTable
          className="w-full max-w-full"
          columnClassName="!h-auto group-hover:bg-black"
          data={data}
          keyExtractor={(item) => item.name.join('.')}
          columns={[
            {
              name: 'Name',
              className: 'text-left',
              width: 'auto',
              render(item) {
                return (
                  <div className="row items-center gap-2">
                    {item.name.map((name, index) => (
                      <div
                        key={name}
                        className={
                          index === item.name.length - 1
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground'
                        }
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                );
              },
            },
            {
              name: 'Value',
              className: 'text-right font-mono font-medium',
              width: 'auto',
              render(item) {
                const render = () => {
                  if (
                    item.name[0] === 'duration' &&
                    typeof item.value === 'number'
                  ) {
                    return (
                      <div className="text-right">
                        <span className="text-muted-foreground">
                          ({item.value}ms)
                        </span>{' '}
                        {number.formatWithUnit(item.value / 1000, 'min')}
                      </div>
                    );
                  }

                  if (
                    isNil(item.value) ||
                    item.value === '' ||
                    item.value === '\x00\x00'
                  ) {
                    return <div className="text-right">-</div>;
                  }

                  if (typeof item.value === 'string') {
                    return <div className="text-right">{item.value}</div>;
                  }

                  if ((item.value as unknown) instanceof Date) {
                    return (
                      <div className="text-right">
                        {formatDateTime(item.value as unknown as Date)}
                      </div>
                    );
                  }

                  return (
                    <div className="text-right">
                      {JSON.stringify(item.value)}
                    </div>
                  );
                };

                if (
                  item.name[0] &&
                  item.value &&
                  filterable[item.name[0] as keyof typeof filterable]
                ) {
                  return (
                    <button
                      className="row items-center gap-2"
                      type="button"
                      onClick={() => {
                        setFilter(
                          item.name[0] === 'properties'
                            ? item.name.join('.')
                            : filterable[
                                item.name[0] as keyof typeof filterable
                              ],
                          item.value,
                        );
                      }}
                    >
                      <FilterIcon className="size-3 shrink-0" />
                      {render()}
                    </button>
                  );
                }

                return render();
              },
            },
          ]}
        />
        <div className="row justify-center">
          <Button variant="outline" onClick={() => setShowNullable((p) => !p)}>
            {showNullable ? 'Hide empty values' : 'Show empty values'}
          </Button>
        </div>
      </div>
      <div>
        <div className="mb-2 flex justify-between font-medium">
          <div>Similar events</div>
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
    </ModalContent>
  );
}
