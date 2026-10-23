import { useQuery } from '@tanstack/react-query';
import { ISLAND_TOP_COUNT } from './live-constants';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { getCountry } from '@/translations/countries';

interface IslandItem {
  key: string;
  icon: string;
  label: string;
  count: number;
}

export function LiveTopIsland({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.realtime.topSources.queryOptions({ projectId })
  );

  const referrers: IslandItem[] = (data?.referrers ?? [])
    .slice(0, ISLAND_TOP_COUNT)
    .map((row) => ({
      key: row.name,
      icon: row.name,
      label: row.name,
      count: row.sessions,
    }));
  const countries: IslandItem[] = (data?.countries ?? [])
    .slice(0, ISLAND_TOP_COUNT)
    .map((row) => ({
      key: row.country,
      icon: row.country,
      label: getCountry(row.country) ?? row.country,
      count: row.sessions,
    }));

  if (referrers.length === 0 && countries.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-2xl border bg-card/85 px-4 py-3 shadow-lg backdrop-blur-md">
      <IslandRow items={referrers} label="Referrers" />
      <IslandRow items={countries} label="Countries" />
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
      <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {items.map((item) => (
          <li
            className="flex items-center gap-1.5 whitespace-nowrap"
            key={item.key}
          >
            <SerieIcon name={item.icon} />
            <span>{item.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {number.format(item.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
