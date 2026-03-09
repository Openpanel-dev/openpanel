import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  EyeIcon,
  MousePointerClickIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Pagination } from '@/components/pagination';
import { useAppContext } from '@/hooks/use-app-context';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';

type InsightType =
  | 'low_ctr'
  | 'near_page_one'
  | 'invisible_clicks'
  | 'high_bounce';

interface PageInsight {
  page: string;
  origin: string;
  path: string;
  type: InsightType;
  impact: number;
  headline: string;
  suggestion: string;
  metrics: string;
}

const INSIGHT_CONFIG: Record<
  InsightType,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  low_ctr: {
    label: 'Low CTR',
    icon: MousePointerClickIcon,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  near_page_one: {
    label: 'Near page 1',
    icon: TrendingUpIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  invisible_clicks: {
    label: 'Low visibility',
    icon: EyeIcon,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-100 dark:bg-violet-900/30',
  },
  high_bounce: {
    label: 'High bounce',
    icon: AlertTriangleIcon,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
};

interface PagesInsightsProps {
  projectId: string;
}

export function PagesInsights({ projectId }: PagesInsightsProps) {
  const trpc = useTRPC();
  const { range, interval, startDate, endDate } = useOverviewOptions();
  const { apiUrl } = useAppContext();
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const dateInput = {
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  };

  const gscPagesQuery = useQuery(
    trpc.gsc.getPages.queryOptions(
      { projectId, ...dateInput, limit: 1000 },
      { placeholderData: keepPreviousData }
    )
  );

  const analyticsQuery = useQuery(
    trpc.event.pages.queryOptions(
      { projectId, cursor: 1, take: 1000, search: undefined, range, interval },
      { placeholderData: keepPreviousData }
    )
  );

  const insights = useMemo<PageInsight[]>(() => {
    const gscPages = gscPagesQuery.data ?? [];
    const analyticsPages = analyticsQuery.data ?? [];

    const analyticsMap = new Map(
      analyticsPages.map((p) => [p.origin + p.path, p])
    );

    const results: PageInsight[] = [];

    for (const gsc of gscPages) {
      let origin = '';
      let path = gsc.page;
      try {
        const url = new URL(gsc.page);
        origin = url.origin;
        path = url.pathname + url.search;
      } catch {
        // keep as-is
      }

      const analytics = analyticsMap.get(gsc.page);

      // 1. Low CTR: ranking on page 1 but click rate is poor
      if (gsc.position <= 10 && gsc.ctr < 0.04 && gsc.impressions >= 100) {
        results.push({
          page: gsc.page,
          origin,
          path,
          type: 'low_ctr',
          impact: gsc.impressions * (0.04 - gsc.ctr),
          headline: `Ranking #${Math.round(gsc.position)} but only ${(gsc.ctr * 100).toFixed(1)}% CTR`,
          suggestion:
            'You are on page 1 but people rarely click. Rewrite your title tag and meta description to be more compelling and match search intent.',
          metrics: `Pos ${Math.round(gsc.position)} · ${gsc.impressions.toLocaleString()} impr · ${(gsc.ctr * 100).toFixed(1)}% CTR`,
        });
      }

      // 2. Near page 1: just off the first page with decent visibility
      if (gsc.position > 10 && gsc.position <= 20 && gsc.impressions >= 100) {
        results.push({
          page: gsc.page,
          origin,
          path,
          type: 'near_page_one',
          impact: gsc.impressions / gsc.position,
          headline: `Position ${Math.round(gsc.position)} — one push from page 1`,
          suggestion:
            'A content refresh, more internal links, or a few backlinks could move this into the top 10 and dramatically increase clicks.',
          metrics: `Pos ${Math.round(gsc.position)} · ${gsc.impressions.toLocaleString()} impr · ${gsc.clicks} clicks`,
        });
      }

      // 3. Invisible clicks: high impressions but barely any clicks
      if (gsc.impressions >= 500 && gsc.ctr < 0.01 && gsc.position > 10) {
        results.push({
          page: gsc.page,
          origin,
          path,
          type: 'invisible_clicks',
          impact: gsc.impressions,
          headline: `${gsc.impressions.toLocaleString()} impressions but only ${gsc.clicks} clicks`,
          suggestion:
            'Google shows this page a lot, but it almost never gets clicked. Consider whether the page targets the right queries or if a different format (e.g. listicle, how-to) would perform better.',
          metrics: `${gsc.impressions.toLocaleString()} impr · ${gsc.clicks} clicks · Pos ${Math.round(gsc.position)}`,
        });
      }

      // 4. High bounce: good traffic but poor engagement (requires analytics match)
      if (
        analytics &&
        analytics.bounce_rate >= 70 &&
        analytics.sessions >= 20
      ) {
        results.push({
          page: gsc.page,
          origin,
          path,
          type: 'high_bounce',
          impact: analytics.sessions * (analytics.bounce_rate / 100),
          headline: `${Math.round(analytics.bounce_rate)}% bounce rate on a page with ${analytics.sessions} sessions`,
          suggestion:
            'Visitors are leaving without engaging. Check if the page delivers on its title/meta promise, improve page speed, and make sure key content is above the fold.',
          metrics: `${Math.round(analytics.bounce_rate)}% bounce · ${analytics.sessions} sessions · ${gsc.impressions.toLocaleString()} impr`,
        });
      }
    }

    // Also check analytics pages without GSC match for high bounce
    for (const p of analyticsPages) {
      const fullUrl = p.origin + p.path;
      if (
        !gscPagesQuery.data?.some((g) => g.page === fullUrl) &&
        p.bounce_rate >= 75 &&
        p.sessions >= 30
      ) {
        results.push({
          page: fullUrl,
          origin: p.origin,
          path: p.path,
          type: 'high_bounce',
          impact: p.sessions * (p.bounce_rate / 100),
          headline: `${Math.round(p.bounce_rate)}% bounce rate with ${p.sessions} sessions`,
          suggestion:
            'High bounce rate with no search visibility. Review content quality and check if the page is indexed and targeting the right keywords.',
          metrics: `${Math.round(p.bounce_rate)}% bounce · ${p.sessions} sessions`,
        });
      }
    }

    // Dedupe by (page, type), keep highest impact
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      const key = `${r.page}::${r.type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => b.impact - a.impact);
  }, [gscPagesQuery.data, analyticsQuery.data]);

  const isLoading = gscPagesQuery.isLoading || analyticsQuery.isLoading;

  const pageCount = Math.ceil(insights.length / pageSize) || 1;
  const paginatedInsights = useMemo(
    () => insights.slice(page * pageSize, (page + 1) * pageSize),
    [insights, page, pageSize]
  );
  const rangeStart = insights.length ? page * pageSize + 1 : 0;
  const rangeEnd = Math.min((page + 1) * pageSize, insights.length);

  if (!isLoading && !insights.length) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">Opportunities</h3>
          {insights.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
              {insights.length}
            </span>
          )}
        </div>
        {insights.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {insights.length === 0
                ? '0 results'
                : `${rangeStart}-${rangeEnd} of ${insights.length}`}
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
        {isLoading &&
          [1, 2, 3, 4].map((i) => (
            <div className="flex items-start gap-3 p-4" key={i}>
              <div className="mt-0.5 h-7 w-20 animate-pulse rounded-md bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        {paginatedInsights.map((insight, i) => {
          const config = INSIGHT_CONFIG[insight.type];
          const Icon = config.icon;

          return (
            <button
              className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40"
              key={`${insight.page}-${insight.type}-${i}`}
              onClick={() =>
                pushModal('PageDetails', {
                  type: 'page',
                  projectId,
                  value: insight.page,
                })
              }
              type="button"
            >
              <div className="col min-w-0 flex-1 gap-2">
                <div className="flex items-center gap-2">
                  <img
                    alt=""
                    className="size-3.5 shrink-0 rounded-sm"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                    src={`${apiUrl}/misc/favicon?url=${insight.origin}`}
                  />
                  <span className="truncate font-medium font-mono text-xs">
                    {insight.path || insight.page}
                  </span>

                  <span
                    className={cn(
                      'row shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-medium text-xs',
                      config.color,
                      config.bg
                    )}
                  >
                    <Icon className="size-3" />
                    {config.label}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="font-medium text-foreground">
                    {insight.headline}.
                  </span>{' '}
                  {insight.suggestion}
                </p>
              </div>

              <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground text-xs">
                {insight.metrics}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
