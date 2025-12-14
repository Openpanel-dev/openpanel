import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { InsightCard } from '@/components/insights/insight-card';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/skeleton';
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
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/insights',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle('Insights'),
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

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data: insights, isLoading } = useQuery(
    trpc.insight.listAll.queryOptions({
      projectId,
      limit: 500,
    }),
  );

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [windowKindFilter, setWindowKindFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('impact-desc');

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

  const uniqueModules = useMemo(() => {
    if (!insights) return [];
    return Array.from(new Set(insights.map((i) => i.moduleKey))).sort();
  }, [insights]);

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Insights" className="mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
            <Skeleton key={key} className="h-48" />
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
      <TableButtons>
        <Input
          placeholder="Search insights..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {uniqueModules.map((module) => (
              <SelectItem key={module} value={module}>
                {module.replace('-', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={windowKindFilter} onValueChange={setWindowKindFilter}>
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
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
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
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
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
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortOption)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAndSorted.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      {filteredAndSorted.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground text-center">
          Showing {filteredAndSorted.length} of {insights?.length ?? 0} insights
        </div>
      )}
    </PageContainer>
  );
}
