import { FieldValue } from '@/components/ui/key-value-grid';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { camelCaseToWords } from '@/utils/casing';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import type { IClickhouseEvent, IServiceEvent } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, FilterIcon, Loader2Icon } from 'lucide-react';
import { omit } from 'ramda';
import { useState } from 'react';

/**
 * Event fields that can be turned into a dashboard filter when clicked.
 * Shared between the inline events-table dropdown and the EventDetails modal.
 */
export const filterable: Partial<
  Record<keyof IServiceEvent, keyof IClickhouseEvent>
> = {
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

type Mode = 'formatted' | 'json';

interface EventRowDetailsProps {
  /**
   * The row event. Carries id/createdAt/projectId and the first-class columns,
   * but NOT the `properties` map (the list query omits it), so we fetch the full
   * event lazily on expand.
   */
  event: IServiceEvent;
  className?: string;
  /** Called after a filter is applied (e.g. to close the host modal). */
  onAfterFilter?: () => void;
}

export function EventRowDetails({
  event: seed,
  className,
  onAfterFilter,
}: EventRowDetailsProps) {
  const [mode, setMode] = useState<Mode>('formatted');
  const [, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();

  // Fetch the full event (incl. the `properties` map) — cheap point-lookup,
  // cached by React Query, only fired when a row is expanded.
  const query = useQuery(
    trpc.event.byId.queryOptions({
      id: seed.id,
      projectId: seed.projectId,
      createdAt: seed.createdAt,
      withProfile: false,
    }),
  );

  // Use the row data immediately for the first-class fields; the fetched event
  // is the source of truth once loaded (and the only source for `properties`).
  const event = query.data ?? seed;
  const isLoading = query.isPending;
  const isError = query.isError;

  // Merge custom properties (the ClickHouse `properties` Map) and the first-class
  // event columns into a single list, properties first. Each item is tagged so the
  // click handler knows how to build the filter.
  const propertyItems = Object.entries(event.properties ?? {})
    .filter(([name]) => !name.startsWith('__'))
    .map(([name, value]) => ({
      kind: 'property' as const,
      name,
      value,
      event,
    }));

  const fieldItems = Object.entries(
    omit(['properties', 'profile', 'meta'], event),
  )
    .filter(([name, value]) => !name.startsWith('__') && !!value)
    .map(([name, value]) => ({
      kind: 'field' as const,
      name,
      value: value as any,
      event,
    }));

  const data = [...propertyItems, ...fieldItems];

  const applyFilter = (item: (typeof data)[number]) => {
    if (item.kind === 'property') {
      setFilter(`properties.${item.name}`, item.value as any);
      onAfterFilter?.();
    } else if ((filterable as any)[item.name]) {
      setFilter(item.name as keyof IServiceEvent, item.value);
      onAfterFilter?.();
    }
  };

  return (
    <div className={cn('col gap-3 p-4 bg-def-100 border-t', className)}>
      <div className="row items-center gap-2 justify-between">
        <div className="row items-center gap-2">
          <SegmentedToggle mode={mode} onChange={setMode} />
          {isLoading && (
            <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>
        {mode === 'json' && !isLoading && <CopyButton value={toJson(event)} />}
      </div>

      {isError && (
        <div className="text-xs text-muted-foreground">
          Couldn't load full event details — showing partial data.
        </div>
      )}

      {mode === 'formatted' ? (
        isLoading ? (
          <PropertiesSkeleton />
        ) : (
          <div className="overflow-auto max-h-[480px] rounded-md">
            <div className="grid grid-cols-1 card overflow-hidden md:grid-cols-2 lg:grid-cols-3">
              {data.map((it, i) => {
                const showFilter =
                  it.kind === 'property' || !!(filterable as any)[it.name];
                const label =
                  it.kind === 'property' ? it.name : camelCaseToWords(it.name);
                return (
                  <div
                    key={`${it.name}-${i.toString()}`}
                    className="group flex min-w-0 items-center gap-1.5 p-3 text-sm shadow-[0_0_0_0.5px] shadow-border"
                  >
                    <span
                      className="max-w-[45%] shrink-0 truncate text-muted-foreground"
                      title={it.name}
                    >
                      {label}
                    </span>
                    <span className="shrink-0 text-muted-foreground">:</span>
                    <div
                      className="min-w-0 flex-1 truncate font-mono"
                      title={
                        typeof it.value === 'string' ? it.value : undefined
                      }
                    >
                      {it.kind === 'property' ? (
                        String(it.value)
                      ) : (
                        <FieldValue
                          name={it.name}
                          value={it.value}
                          event={event}
                        />
                      )}
                    </div>
                    {showFilter && (
                      <button
                        type="button"
                        title="Filter by this value"
                        onClick={(e) => {
                          e.stopPropagation();
                          applyFilter(it);
                        }}
                        className="ml-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <FilterIcon className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : isLoading ? (
        <PropertiesSkeleton />
      ) : (
        <pre className="card overflow-auto p-4 text-xs leading-relaxed font-mono max-h-[480px]">
          {toJson(event)}
        </pre>
      )}
    </div>
  );
}

function toJson(event: IServiceEvent) {
  return JSON.stringify(omit(['profile', 'meta'], event), null, 2);
}

function PropertiesSkeleton() {
  return (
    <div className="card overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i.toString()}
          className="flex items-center justify-between gap-4 p-4 py-3 shadow-[0_0_0_0.5px] shadow-border"
        >
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function SegmentedToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5 text-xs">
      {(['formatted', 'json'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            'rounded px-2 py-1 capitalize transition-colors',
            mode === value
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        clipboard(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="row items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <CheckIcon className="size-3" />
      ) : (
        <CopyIcon className="size-3" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
