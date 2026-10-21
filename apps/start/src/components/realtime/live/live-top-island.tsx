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

function sumSessionsByCountry(
  rows: Array<{ country: string; unique_sessions: number }>
): IslandItem[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.country) {
      continue;
    }
    totals.set(
      row.country,
      (totals.get(row.country) ?? 0) + row.unique_sessions
    );
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, ISLAND_TOP_COUNT)
    .map(([country, count]) => ({
      key: country,
      icon: country,
      label: getCountry(country) ?? country,
      count,
    }));
}

export function LiveTopIsland({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const referrals = useQuery(
    trpc.realtime.referrals.queryOptions({ projectId })
  );
  const geo = useQuery(trpc.realtime.geo.queryOptions({ projectId }));

  const referrers: IslandItem[] = (referrals.data ?? [])
    .filter((row) => row.referrer_name)
    .slice(0, ISLAND_TOP_COUNT)
    .map((row) => ({
      key: row.referrer_name,
      icon: row.referrer_name,
      label: row.referrer_name,
      count: row.unique_sessions,
    }));
  const countries = sumSessionsByCountry(geo.data ?? []);

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
