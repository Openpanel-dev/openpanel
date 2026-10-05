import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLinkIcon } from 'lucide-react';
import { useMemo } from 'react';
import { PageSparkline } from '@/components/pages/page-sparkline';
import { createHeaderColumn } from '@/components/ui/data-table/data-table-helpers';
import { useAppContext } from '@/hooks/use-app-context';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';

// `avg_duration` arrives in MINUTES — the MCP `get_page_performance` tool
// documents that unit and its SEO thresholds are built on it — while
// `fancyMinutes` takes seconds. Without this every page rendered "0s".
const SECONDS_PER_MINUTE = 60;

export type PageRow = RouterOutputs['event']['pages'][number] & {
  gsc?: { clicks: number; impressions: number; ctr: number; position: number };
};

export function useColumns({
  projectId,
  isGscConnected,
  previousMap,
}: {
  projectId: string;
  isGscConnected: boolean;
  previousMap?: Map<string, number>;
}): ColumnDef<PageRow>[] {
  const number = useNumber();
  const { apiUrl } = useAppContext();

  return useMemo<ColumnDef<PageRow>[]>(() => {
    const cols: ColumnDef<PageRow>[] = [
      {
        id: 'page',
        accessorFn: (row) => `${row.origin}${row.path} ${row.title ?? ''}`,
        header: createHeaderColumn('Page'),
        size: 400,
        meta: { bold: true },
        cell: ({ row }) => {
          const page = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              {/* No origin means no favicon to fetch (`?url=` would 404). The
                  value is user data, so it is encoded. */}
              {page.origin ? (
                <img
                  alt=""
                  className="size-4 shrink-0 rounded-sm"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  src={`${apiUrl}/misc/favicon?url=${encodeURIComponent(page.origin)}`}
                />
              ) : (
                <div className="size-4 shrink-0" />
              )}
              <div className="min-w-0">
                {page.title && (
                  <div className="truncate font-medium text-sm leading-tight">
                    {page.title}
                  </div>
                )}
                <div className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-mono text-muted-foreground text-xs">
                    {page.path}
                  </span>
                  <a
                    className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100"
                    href={page.origin + page.path}
                    onClick={(e) => e.stopPropagation()}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    <ExternalLinkIcon className="size-3 text-muted-foreground" />
                  </a>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'trend',
        header: 'Trend',
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <PageSparkline
            origin={row.original.origin}
            path={row.original.path}
            projectId={projectId}
          />
        ),
      },
      {
        accessorKey: 'pageviews',
        header: createHeaderColumn('Views'),
        size: 80,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {number.short(row.original.pageviews)}
          </span>
        ),
      },
      {
        accessorKey: 'sessions',
        header: createHeaderColumn('Sessions'),
        size: 90,
        cell: ({ row }) => {
          const prev = previousMap?.get(
            row.original.origin + row.original.path
          );
          // The count is always known. Only the comparison depends on having a
          // previous period, so a missing `prev` hides the delta, not the
          // number.
          const count = (
            <span className="font-mono text-sm tabular-nums">
              {number.short(row.original.sessions)}
            </span>
          );

          if (prev == null) {
            return count;
          }

          if (prev === 0) {
            return (
              <div className="flex items-center gap-2">
                {count}
                <span className="text-muted-foreground">new</span>
              </div>
            );
          }

          const pct = ((row.original.sessions - prev) / prev) * 100;
          const isPos = pct >= 0;

          return (
            <div className="flex items-center gap-2">
              {count}
              <span
                className={`font-mono text-sm tabular-nums ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {isPos ? '+' : ''}
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'bounce_rate',
        header: createHeaderColumn('Bounce'),
        size: 80,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {row.original.bounce_rate.toFixed(0)}%
          </span>
        ),
      },
      {
        accessorKey: 'avg_duration',
        header: createHeaderColumn('Duration'),
        size: 90,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-sm tabular-nums">
            {fancyMinutes(row.original.avg_duration * SECONDS_PER_MINUTE)}
          </span>
        ),
      },
    ];

    if (isGscConnected) {
      cols.push(
        {
          id: 'gsc_impressions',
          accessorFn: (row) => row.gsc?.impressions ?? 0,
          header: createHeaderColumn('Impr.'),
          size: 80,
          cell: ({ row }) =>
            row.original.gsc ? (
              <span className="font-mono text-sm tabular-nums">
                {number.short(row.original.gsc.impressions)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: 'gsc_ctr',
          accessorFn: (row) => row.gsc?.ctr ?? 0,
          header: createHeaderColumn('CTR'),
          size: 70,
          cell: ({ row }) =>
            row.original.gsc ? (
              <span className="font-mono text-sm tabular-nums">
                {(row.original.gsc.ctr * 100).toFixed(1)}%
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: 'gsc_clicks',
          accessorFn: (row) => row.gsc?.clicks ?? 0,
          header: createHeaderColumn('Clicks'),
          size: 80,
          cell: ({ row }) =>
            row.original.gsc ? (
              <span className="font-mono text-sm tabular-nums">
                {number.short(row.original.gsc.clicks)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }
      );
    }

    return cols;
  }, [isGscConnected, number, apiUrl, projectId, previousMap]);
}
