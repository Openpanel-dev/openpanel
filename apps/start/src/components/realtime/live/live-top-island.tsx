import { useQuery } from '@tanstack/react-query';
import { ISLAND_TOP_COUNT } from './live-constants';
import { useRealtimeFilters } from './use-realtime-filters';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { getCountry } from '@/translations/countries';
import { cn } from '@/utils/cn';

interface IslandItem {
  key: string;
  icon: string;
  label: string;
  count: number;
  isActive: boolean;
  onToggle: () => void;
}

export function LiveTopIsland({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { filters, countries, referrers, toggleCountry, toggleReferrer } =
    useRealtimeFilters();
  const { data } = useQuery(
    trpc.realtime.topSources.queryOptions({ projectId, filters })
  );

  const referrerItems: IslandItem[] = (data?.referrers ?? [])
    .slice(0, ISLAND_TOP_COUNT)
    .map((row) => ({
      key: row.name,
      icon: row.name,
      label: row.name,
      count: row.sessions,
      isActive: referrers.includes(row.name),
      onToggle: () => toggleReferrer(row.name),
    }));
  const countryItems: IslandItem[] = (data?.countries ?? [])
    .slice(0, ISLAND_TOP_COUNT)
    .map((row) => ({
      key: row.country,
      icon: row.country,
      label: getCountry(row.country) ?? row.country,
      count: row.sessions,
      isActive: countries.includes(row.country),
      onToggle: () => toggleCountry(row.country),
    }));

  if (referrerItems.length === 0 && countryItems.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-2xl border bg-card/85 px-4 py-3 shadow-lg backdrop-blur-md">
      <IslandRow items={referrerItems} label="Referrers" />
      <IslandRow items={countryItems} label="Countries" />
    </div>
  );
}

function IslandRow({ label, items }: { label: string; items: IslandItem[] }) {
  const number = useNumber();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      <span className="w-20 shrink-0 font-medium text-2xs text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      <ul className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item) => (
          <li key={item.key}>
            <button
              aria-pressed={item.isActive}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors hover:bg-def-200',
                item.isActive && 'bg-def-200'
              )}
              onClick={item.onToggle}
              title={`Filter by ${item.label}`}
              type="button"
            >
              <SerieIcon name={item.icon} />
              <span>{item.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {number.format(item.count)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
