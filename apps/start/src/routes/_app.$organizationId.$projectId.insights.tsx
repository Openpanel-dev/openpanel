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
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useMemo } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/insights',
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
  const trpc = useTRPC();
  const { data: insights, isLoading } = useQuery(
    trpc.insight.listAll.queryOptions({
      projectId,
      limit: 500,
    }),
  );
  const navigate = useNavigate();

  const [search, setSearch] = useQueryState(
    'search',
    parseAsString.withDefault(''),
  );
  const [moduleFilter, setModuleFilter] = useQueryState(
    'module',
    parseAsString.withDefault('all'),
  );
  const [windowKindFilter, setWindowKindFilter] = useQueryState(
    'window',
    parseAsStringEnum([
      'all',
      'yesterday',
      'rolling_7d',
      'rolling_30d',
    ]).withDefault('all'),
  );
  const [severityFilter, setSeverityFilter] = useQueryState(
    'severity',
    parseAsStringEnum(['all', 'severe', 'moderate', 'low', 'none']).withDefault(
      'all',
    ),
  );
  const [directionFilter, setDirectionFilter] = useQueryState(
    'direction',
    parseAsStringEnum(['all', 'up', 'down', 'flat']).withDefault('all'),
  );
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsStringEnum<SortOption>([
      'impact-desc',
      'impact-asc',
      'severity-desc',
      'severity-asc',
      'recent',
    ]).withDefault('impact-desc'),
  );

  const filteredAndSorted = useMemo(() => {
    if (!insights) return [];

    const filtered = insights.filter((insight) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesTitle = insight.title.toLowerCase().includes(searchLower);
        const matchesSummary = insight.summary
          ?.toLowerCase()
          .includes(searchLower);
        const matchesDimension = insight.dimensionKey
          .toLowerCase()
          .includes(searchLower);
        if (!matchesTitle && !matchesSummary && !matchesDimension) {
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
        if (severityFilter === 'none' && insight.severityBand) return false;
        if (
          severityFilter !== 'none' &&
          insight.severityBand !== severityFilter
        )
          return false;
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
        if (keyA === 'referrers') return -1;
        if (keyB === 'referrers') return 1;

        // Calculate average impact for each module
        const avgImpactA =
          insightsA.reduce((sum, i) => sum + (i.impactScore ?? 0), 0) /
          insightsA.length;
        const avgImpactB =
          insightsB.reduce((sum, i) => sum + (i.impactScore ?? 0), 0) /
          insightsB.length;

        // Sort by average impact (high to low)
        return avgImpactB - avgImpactA;
      },
    );
  }, [filteredAndSorted]);

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Insights" className="mb-8" />
        <div className="space-y-8">
          {Array.from({ length: 3 }, (_, i) => `section-${i}`).map((key) => (
            <div key={key} className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Carousel opts={{ align: 'start' }} className="w-full">
                <CarouselContent className="-ml-4">
                  {Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map(
                    (cardKey) => (
                      <CarouselItem
                        key={cardKey}
                        className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                      >
                        <Skeleton className="h-48 w-full" />
                      </CarouselItem>
                    ),
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
        title="Insights"
        description="Discover trends and changes in your analytics"
        className="mb-8"
      />
      <TableButtons className="mb-8">
        <Input
          placeholder="Search insights..."
          value={search ?? ''}
          onChange={(e) => void setSearch(e.target.value || null)}
          className="max-w-xs"
        />
        <Select
          value={windowKindFilter ?? 'all'}
          onValueChange={(v) =>
            void setWindowKindFilter(v as typeof windowKindFilter)
          }
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
          value={severityFilter ?? 'all'}
          onValueChange={(v) =>
            void setSeverityFilter(v as typeof severityFilter)
          }
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
          value={directionFilter ?? 'all'}
          onValueChange={(v) =>
            void setDirectionFilter(v as typeof directionFilter)
          }
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
          value={sortBy ?? 'impact-desc'}
          onValueChange={(v) => void setSortBy(v as SortOption)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
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
          title="No insights found"
          description={
            search || moduleFilter !== 'all' || windowKindFilter !== 'all'
              ? 'Try adjusting your filters to see more insights.'
              : 'Insights will appear here as trends are detected in your analytics.'
          }
        />
      )}

      {groupedByModule.length > 0 && (
        <div className="space-y-8">
          {groupedByModule.map(([moduleKey, moduleInsights]) => (
            <div key={moduleKey} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold capitalize">
                  {getModuleDisplayName(moduleKey)}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {moduleInsights.length}{' '}
                  {moduleInsights.length === 1 ? 'insight' : 'insights'}
                </span>
              </div>
              <div className="-mx-8">
                <Carousel
                  opts={{ align: 'start', dragFree: true }}
                  className="w-full group"
                >
                  <CarouselContent className="mx-4 mr-8">
                    {moduleInsights.map((insight, index) => (
                      <CarouselItem
                        key={insight.id}
                        className={cn(
                          'pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4',
                        )}
                      >
                        <InsightCard
                          insight={insight}
                          onFilter={(() => {
                            const filterString = insight.payload?.dimensions
                              .map(
                                (dim) =>
                                  `${dim.key},is,${encodeURIComponent(dim.value)}`,
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
                  <CarouselPrevious className="opacity-0 [&:disabled]:opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto left-3" />
                  <CarouselNext className="opacity-0  [&:disabled]:opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto right-3" />
                </Carousel>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredAndSorted.length > 0 && (
        <div className="mt-8 text-sm text-muted-foreground text-center">
          Showing {filteredAndSorted.length} of {insights?.length ?? 0} insights
        </div>
      )}
    </PageContainer>
  );
}
