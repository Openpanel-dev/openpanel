import { ReportChartShortcut } from '@/components/report-chart/shortcut';
import { KeyValue } from '@/components/ui/key-value';
import { useAppParams } from '@/hooks/useAppParams';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';
import { round } from 'mathjs';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface Props {
  id: string;
}

export default function EventDetails({ id }: Props) {
  const { projectId } = useAppParams();
  const [, setEvents] = useEventQueryNamesFilter();
  const [, setFilter] = useEventQueryFilters();
  const query = api.event.byId.useQuery({ id, projectId });

  if (query.isLoading || query.isFetching) {
    return null;
  }

  if (query.isError || !query.isSuccess) {
    return null;
  }

  const event = query.data;

  const common = [
    {
      name: 'Origin',
      value: event.origin,
    },
    {
      name: 'Duration',
      value: event.duration ? round(event.duration / 1000, 1) : undefined,
    },
    {
      name: 'Referrer',
      value: event.referrer,
      onClick() {
        setFilter('referrer', event.referrer ?? '');
      },
    },
    {
      name: 'Referrer name',
      value: event.referrerName,
      onClick() {
        setFilter('referrer_name', event.referrerName ?? '');
      },
    },
    {
      name: 'Referrer type',
      value: event.referrerType,
      onClick() {
        setFilter('referrer_type', event.referrerType ?? '');
      },
    },
    {
      name: 'Brand',
      value: event.brand,
      onClick() {
        setFilter('brand', event.brand ?? '');
      },
    },
    {
      name: 'Model',
      value: event.model,
      onClick() {
        setFilter('model', event.model ?? '');
      },
    },
    {
      name: 'Browser',
      value: event.browser,
      onClick() {
        setFilter('browser', event.browser ?? '');
      },
    },
    {
      name: 'Browser version',
      value: event.browserVersion,
      onClick() {
        setFilter('browser_version', event.browserVersion ?? '');
      },
    },
    {
      name: 'OS',
      value: event.os,
      onClick() {
        setFilter('os', event.os ?? '');
      },
    },
    {
      name: 'OS version',
      value: event.osVersion,
      onClick() {
        setFilter('os_version', event.osVersion ?? '');
      },
    },
    {
      name: 'City',
      value: event.city,
      onClick() {
        setFilter('city', event.city ?? '');
      },
    },
    {
      name: 'Region',
      value: event.region,
      onClick() {
        setFilter('region', event.region ?? '');
      },
    },
    {
      name: 'Country',
      value: event.country,
      onClick() {
        setFilter('country', event.country ?? '');
      },
    },
    {
      name: 'Device',
      value: event.device,
      onClick() {
        setFilter('device', event.device ?? '');
      },
    },
  ].filter((item) => typeof item.value === 'string' && item.value);

  const properties = Object.entries(event.properties)
    .map(([name, value]) => ({
      name,
      value: value as string | number | undefined,
    }))
    .filter((item) => typeof item.value === 'string' && item.value);

  return (
    <ModalContent>
      <ModalHeader title={event.name} />
      <div>
        <div className="flex flex-col gap-8">
          {properties.length > 0 && (
            <div>
              <div className="mb-2  font-medium">Params</div>
              <div className="flex flex-wrap gap-2">
                {properties.map((item) => (
                  <KeyValue
                    key={item.name}
                    name={item.name.replace(/^__/, '')}
                    value={item.value}
                    onClick={() => {
                      setFilter(
                        `properties.${item.name}`,
                        item.value ? String(item.value) : '',
                        'is',
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2  font-medium">Common</div>
            <div className="flex flex-wrap gap-2">
              {common.map((item) => (
                <KeyValue
                  key={item.name}
                  name={item.name}
                  value={item.value}
                  onClick={() => item.onClick?.()}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex justify-between  font-medium">
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
              chartType="histogram"
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
        </div>
      </div>
    </ModalContent>
  );
}
