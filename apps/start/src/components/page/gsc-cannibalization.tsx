import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pagination } from '@/components/pagination';
import { useAppContext } from '@/hooks/use-app-context';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

interface GscCannibalizationProps {
  projectId: string;
  range: string;
  interval: string;
  startDate?: string;
  endDate?: string;
}

export function GscCannibalization({
  projectId,
  range,
  interval,
  startDate,
  endDate,
}: GscCannibalizationProps) {
  const trpc = useTRPC();
  const { apiUrl } = useAppContext();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const query = useQuery(
    trpc.gsc.getCannibalization.queryOptions(
      { projectId, range: range as any, interval: interval as any },
      { placeholderData: keepPreviousData }
    )
  );

  const toggle = (q: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(q)) {
        next.delete(q);
      } else {
        next.add(q);
      }
      return next;
    });
  };

  const items = query.data ?? [];

  const pageCount = Math.ceil(items.length / pageSize) || 1;
  const paginatedItems = useMemo(
    () => items.slice(page * pageSize, (page + 1) * pageSize),
    [items, page, pageSize]
  );
  const rangeStart = items.length ? page * pageSize + 1 : 0;
  const rangeEnd = Math.min((page + 1) * pageSize, items.length);

  if (!(query.isLoading || items.length)) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Keyword Cannibalization</h3>
          {items.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {items.length === 0
                ? '0 results'
                : `${rangeStart}-${rangeEnd} of ${items.length}`}
            </span>
            <Pagination
              canNextPage={page < pageCount - 1}
              canPreviousPage={page > 0}
              nextPage={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              pageIndex={page}
              previousPage={() => setPage((p) => Math.max(0, p - 1))}
            />
          </div>
        )}
      </div>
      <div className="divide-y">
        {query.isLoading &&
          [1, 2, 3].map((i) => (
            <div className="space-y-2 p-4" key={i}>
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        {paginatedItems.map((item) => {
          const isOpen = expanded.has(item.query);
          const winner = item.pages[0];
          const avgCtr =
            item.pages.reduce((s, p) => s + p.ctr, 0) / item.pages.length;

          return (
            <div key={item.query}>
              <button
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                onClick={() => toggle(item.query)}
                type="button"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className={cn(
                      'row shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs',
                      'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                    )}
                  >
                    <AlertCircleIcon className="size-3" />
                    {item.pages.length} pages
                  </div>
                  <span className="truncate font-medium text-sm">
                    {item.query}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="whitespace-nowrap font-mono text-muted-foreground text-xs">
                    {item.totalImpressions.toLocaleString()} impr ·{' '}
                    {(avgCtr * 100).toFixed(1)}% avg CTR
                  </span>
                  <ChevronsUpDownIcon
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="border-t bg-muted/20 px-4 py-3">
                  <p className="mb-3 text-muted-foreground text-xs leading-normal">
                    These pages all rank for{' '}
                    <span className="font-medium text-foreground">
                      "{item.query}"
                    </span>
                    . Consider consolidating weaker pages into the top-ranking
                    one to concentrate link equity and avoid splitting clicks.
                  </p>
                  <div className="space-y-1.5">
                    {item.pages.map((page, idx) => {
                      // Strip hash fragments — GSC sometimes returns heading
                      // anchor URLs (e.g. /page#section) as separate entries
                      let cleanUrl = page.page;
                      let origin = '';
                      let path = page.page;
                      try {
                        const u = new URL(page.page);
                        u.hash = '';
                        cleanUrl = u.toString();
                        origin = u.origin;
                        path = u.pathname + u.search;
                      } catch {
                        cleanUrl = page.page.split('#')[0] ?? page.page;
                      }
                      const isWinner = idx === 0;

                      return (
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                          key={page.page}
                          onClick={() =>
                            pushModal('PageDetails', {
                              type: 'page',
                              projectId,
                              value: cleanUrl,
                            })
                          }
                          type="button"
                        >
                          <img
                            alt=""
                            className="size-3.5 shrink-0 rounded-sm"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                'none';
                            }}
                            src={`${apiUrl}/misc/favicon?url=${origin}`}
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {path || page.page}
                          </span>
                          {isWinner && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 font-medium text-emerald-700 text-xs dark:bg-emerald-900/30 dark:text-emerald-400">
                              #1
                            </span>
                          )}
                          <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground text-xs">
                            pos {page.position.toFixed(1)} ·{' '}
                            {(page.ctr * 100).toFixed(1)}% CTR ·{' '}
                            {page.impressions.toLocaleString()} impr
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
