import { INSIGHT_LIST_ALL_MAX_LIMIT } from '@openpanel/core/modules/insight/insight.constants';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpDownIcon,
  CalendarRangeIcon,
  GaugeIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { EmptyState } from '@/components/empty-state';
import { InsightCard } from '@/components/insights/insight-card';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import { TableButtons } from '@/components/ui/table';
import { ToolbarSelect } from '@/components/ui/toolbar-select';
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

const WINDOW_OPTIONS = [
  { value: 'all', label: 'All windows' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'rolling_7d', label: '7 days' },
  { value: 'rolling_30d', label: '30 days' },
] as const;

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'severe', label: 'Severe' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No severity' },
] as const;

const DIRECTION_OPTIONS = [
  { value: 'all', label: 'All directions' },
  { value: 'up', label: 'Increasing' },
  { value: 'down', label: 'Decreasing' },
  { value: 'flat', label: 'Flat' },
] as const;

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance (AI)' },
  { value: 'impact-desc', label: 'Impact (high → low)' },
  { value: 'impact-asc', label: 'Impact (low → high)' },
  { value: 'severity-desc', label: 'Severity (high → low)' },
  { value: 'severity-asc', label: 'Severity (low → high)' },
  { value: 'recent', label: 'Most recent' },
] as const satisfies readonly { value: SortOption; label: string }[];

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

  const isFiltered =
    search !== '' ||
    moduleFilter !== 'all' ||
    windowKindFilter !== 'all' ||
    severityFilter !== 'all' ||
    directionFilter !== 'all';
  const clearFilters = () => {
    setSearch(null);
    setModuleFilter(null);
    setWindowKindFilter(null);
    setSeverityFilter(null);
    setDirectionFilter(null);
  };

  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description="Discover trends and changes in your analytics"
        title="Insights"
      />
      <TableButtons className="mb-8">
        <AnimatedSearchInput
          onChange={(value) => setSearch(value || null)}
          placeholder="Search insights"
          value={search ?? ''}
        />
        <ToolbarSelect
          icon={CalendarRangeIcon}
          label="Time window"
          onChange={setWindowKindFilter}
          options={WINDOW_OPTIONS}
          value={windowKindFilter ?? 'all'}
        />
        <ToolbarSelect
          icon={GaugeIcon}
          label="Severity"
          onChange={setSeverityFilter}
          options={SEVERITY_OPTIONS}
          value={severityFilter ?? 'all'}
        />
        <ToolbarSelect
          icon={ArrowUpDownIcon}
          label="Direction"
          onChange={setDirectionFilter}
          options={DIRECTION_OPTIONS}
          value={directionFilter ?? 'all'}
        />
        <ToolbarSelect
          icon={ArrowDownWideNarrowIcon}
          label="Sort by"
          onChange={setSortBy}
          options={SORT_OPTIONS}
          value={sortBy ?? 'relevance'}
        />
      </TableButtons>

      {filteredAndSorted.length === 0 && !isLoading && (
        <InsightsEmptyState
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
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

function InsightsEmptyState({
  isFiltered,
  onClearFilters,
}: {
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  if (isFiltered) {
    return (
      <EmptyState
        description="Nothing matches the current search and filters."
        icon={SearchIcon}
        title="No matching insights"
      >
        <Button onClick={onClearFilters} variant="outline">
          Clear filters
        </Button>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      description="Insights are detected automatically from your traffic. Give it a few days of data and check back."
      icon={SparklesIcon}
      title="No insights yet"
    />
  );
}
