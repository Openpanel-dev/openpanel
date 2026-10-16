import { INSIGHT_LIST_ALL_MAX_LIMIT } from '@openpanel/core/modules/insight/insight.constants';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { InsightCard } from '@/components/insights/insight-card';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableButtons } from '@/components/ui/table';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/insights'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.INSIGHTS),
        },
      ],
    };
  },
});

type SortOption =
  | 'relevance'
  | 'impact-desc'
  | 'impact-asc'
  | 'severity-desc'
  | 'severity-asc'
  | 'recent';

function getModuleDisplayName(moduleKey: string): string {
  const displayNames: Record<string, string> = {
    geo: 'Geographic',
    devices: 'Devices',
    referrers: 'Referrers',
    'entry-pages': 'Entry Pages',
    'page-trends': 'Page Trends',
    'exit-pages': 'Exit Pages',
    'traffic-anomalies': 'Anomalies',
  };
  return displayNames[moduleKey] || moduleKey.replace('-', ' ');
}

function Component() {
  const { projectId } = Route.useParams();
  useRangePageContext('insights');
  const trpc = useTRPC();
  const { data: insights, isLoading } = useQuery(
    trpc.insight.listAll.queryOptions({
      projectId,
      limit: INSIGHT_LIST_ALL_MAX_LIMIT,
    })
  );
  const navigate = useNavigate();

  const [search, setSearch] = useQueryState(
    'search',
    parseAsString.withDefault('')
  );
  const [moduleFilter, setModuleFilter] = useQueryState(
    'module',
    parseAsString.withDefault('all')
  );
  const [windowKindFilter, setWindowKindFilter] = useQueryState(
    'window',
    parseAsStringEnum([
      'all',
      'yesterday',
      'rolling_7d',
      'rolling_30d',
    ]).withDefault('all')
  );
  const [severityFilter, setSeverityFilter] = useQueryState(
    'severity',
    parseAsStringEnum(['all', 'severe', 'moderate', 'low', 'none']).withDefault(
      'all'
    )
  );
  const [directionFilter, setDirectionFilter] = useQueryState(
    'direction',
    parseAsStringEnum(['all', 'up', 'down', 'flat']).withDefault('all')
  );
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringEnum<SortOption>([
      'relevance',
      'impact-desc',
      'impact-asc',
      'severity-desc',
      'severity-asc',
      'recent',
    ]).withDefault('relevance')
  );

  const filteredAndSorted = useMemo(() => {
    if (!insights) {
      return [];
    }

    const filtered = insights.filter((insight) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesTitle = insight.title.toLowerCase().includes(searchLower);
        const matchesSummary = insight.summary
          ?.toLowerCase()
          .includes(searchLower);
        const matchesAiSummary = insight.aiSummary
          ?.toLowerCase()
          .includes(searchLower);
        const matchesDimension = insight.dimensionKey
          .toLowerCase()
          .includes(searchLower);
        if (
          !(
            matchesTitle ||
            matchesSummary ||
            matchesAiSummary ||
            matchesDimension
          )
        ) {
          return false;
        }
      }

      // Module filter
      if (moduleFilter !== 'all' && insight.moduleKey !== moduleFilter) {
        return false;
      }

      // Window kind filter
      if (
        windowKindFilter !== 'all' &&
        insight.windowKind !== windowKindFilter
      ) {
        return false;
      }

      // Severity filter
      if (severityFilter !== 'all') {
        if (severityFilter === 'none' && insight.severityBand) {
          return false;
        }
        if (
          severityFilter !== 'none' &&
          insight.severityBand !== severityFilter
        ) {
          return false;
        }
      }

      // Direction filter
      if (directionFilter !== 'all' && insight.direction !== directionFilter) {
        return false;
      }

      return true;
    });

    // Sort (create new array to avoid mutation)
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          // AI relevance first (un-enriched sort last), impact as tiebreaker.
          return (
            (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1) ||
            (b.impactScore ?? 0) - (a.impactScore ?? 0)
          );
        case 'impact-desc':
          return (b.impactScore ?? 0) - (a.impactScore ?? 0);
        case 'impact-asc':
          return (a.impactScore ?? 0) - (b.impactScore ?? 0);
        case 'severity-desc': {
          const severityOrder: Record<string, number> = {
            severe: 3,
            moderate: 2,
            low: 1,
          };
          const aSev = severityOrder[a.severityBand ?? ''] ?? 0;
          const bSev = severityOrder[b.severityBand ?? ''] ?? 0;
          return bSev - aSev;
        }
        case 'severity-asc': {
          const severityOrder: Record<string, number> = {
            severe: 3,
            moderate: 2,
            low: 1,
          };
          const aSev = severityOrder[a.severityBand ?? ''] ?? 0;
          const bSev = severityOrder[b.severityBand ?? ''] ?? 0;
          return aSev - bSev;
        }
        case 'recent':
          return (
            new Date(b.firstDetectedAt ?? 0).getTime() -
            new Date(a.firstDetectedAt ?? 0).getTime()
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    insights,
    search,
    moduleFilter,
    windowKindFilter,
    severityFilter,
    directionFilter,
    sortBy,
  ]);

  // Group insights by module
  const groupedByModule = useMemo(() => {
    const groups = new Map<string, typeof filteredAndSorted>();

    for (const insight of filteredAndSorted) {
      const existing = groups.get(insight.moduleKey) ?? [];
      existing.push(insight);
      groups.set(insight.moduleKey, existing);
    }

    // Sort modules by impact (referrers first, then by average impact score)
    return Array.from(groups.entries()).sort(
      ([keyA, insightsA], [keyB, insightsB]) => {
        // Referrers always first
        if (keyA === 'referrers') {
          return -1;
        }
        if (keyB === 'referrers') {
          return 1;
        }

        // Calculate average impact for each module
        const avgImpactA =
          insightsA.reduce((sum, i) => sum + (i.impactScore ?? 0), 0) /
          insightsA.length;
        const avgImpactB =
          insightsB.reduce((sum, i) => sum + (i.impactScore ?? 0), 0) /
          insightsB.length;

        // Sort by average impact (high to low)
        return avgImpactB - avgImpactA;
      }
    );
  }, [filteredAndSorted]);

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader className="mb-8" title="Insights" />
        <div className="space-y-8">
          {Array.from({ length: 3 }, (_, i) => `section-${i}`).map((key) => (
            <div className="space-y-4" key={key}>
              <Skeleton className="h-8 w-32" />
              <Carousel className="w-full" opts={{ align: 'start' }}>
                <CarouselContent className="-ml-4">
                  {Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map(
                    (cardKey) => (
                      <CarouselItem
                        className="basis-full pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                        key={cardKey}
                      >
                        <Skeleton className="h-48 w-full" />
                      </CarouselItem>
                    )
                  )}
                </CarouselContent>
              </Carousel>
            </div>
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description="Discover trends and changes in your analytics"
        title="Insights"
      />
      <TableButtons className="mb-8">
        <Input
          className="max-w-xs"
          onChange={(e) => void setSearch(e.target.value || null)}
          placeholder="Search insights..."
          value={search ?? ''}
        />
        <Select
          onValueChange={(v) =>
            void setWindowKindFilter(v as typeof windowKindFilter)
          }
          value={windowKindFilter ?? 'all'}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Time Window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Windows</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="rolling_7d">7 Days</SelectItem>
            <SelectItem value="rolling_30d">30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(v) =>
            void setSeverityFilter(v as typeof severityFilter)
          }
          value={severityFilter ?? 'all'}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="severe">Severe</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="none">No Severity</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(v) =>
            void setDirectionFilter(v as typeof directionFilter)
          }
          value={directionFilter ?? 'all'}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="up">Increasing</SelectItem>
            <SelectItem value="down">Decreasing</SelectItem>
            <SelectItem value="flat">Flat</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(v) => void setSortBy(v as SortOption)}
          value={sortBy ?? 'impact-desc'}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevance (AI)</SelectItem>
            <SelectItem value="impact-desc">Impact (High → Low)</SelectItem>
            <SelectItem value="impact-asc">Impact (Low → High)</SelectItem>
            <SelectItem value="severity-desc">Severity (High → Low)</SelectItem>
            <SelectItem value="severity-asc">Severity (Low → High)</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
          </SelectContent>
        </Select>
      </TableButtons>

      {filteredAndSorted.length === 0 && !isLoading && (
        <FullPageEmptyState
          description={
            search || moduleFilter !== 'all' || windowKindFilter !== 'all'
              ? 'Try adjusting your filters to see more insights.'
              : 'Insights will appear here as trends are detected in your analytics.'
          }
          title="No insights found"
        />
      )}

      {groupedByModule.length > 0 && (
        <div className="space-y-8">
          {groupedByModule.map(([moduleKey, moduleInsights]) => (
            <div className="space-y-4" key={moduleKey}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg capitalize">
                  {getModuleDisplayName(moduleKey)}
                </h2>
                <span className="text-muted-foreground text-sm">
                  {moduleInsights.length}{' '}
                  {moduleInsights.length === 1 ? 'insight' : 'insights'}
                </span>
              </div>
              <div className="-mx-8">
                <Carousel
                  className="group w-full"
                  opts={{ align: 'start', dragFree: true }}
                >
                  <CarouselContent className="mx-4 mr-8">
                    {moduleInsights.map((insight, index) => (
                      <CarouselItem
                        className={cn(
                          'basis-full pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4'
                        )}
                        key={insight.id}
                      >
                        <InsightCard
                          insight={insight}
                          onFilter={(() => {
                            const filterString = insight.payload?.dimensions
                              .map(
                                (dim) =>
                                  `${dim.key},is,${encodeURIComponent(dim.value)}`
                              )
                              .join(';');
                            if (filterString) {
                              return () => {
                                navigate({
                                  to: '/$organizationId/$projectId',
                                  from: Route.fullPath,
                                  search: {
                                    f: filterString,
                                  },
                                });
                              };
                            }
                            return undefined;
                          })()}
                        />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="pointer-events-none left-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&:disabled]:opacity-0" />
                  <CarouselNext className="pointer-events-none right-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&:disabled]:opacity-0" />
                </Carousel>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredAndSorted.length > 0 && (
        <div className="mt-8 text-center text-muted-foreground text-sm">
          Showing {filteredAndSorted.length} of {insights?.length ?? 0} insights
        </div>
      )}
    </PageContainer>
  );
}
