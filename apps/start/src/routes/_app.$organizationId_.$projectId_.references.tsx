import { TableButtons } from '@/components/data-table';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ReferencesTable } from '@/components/references/table';
import { ReportChart } from '@/components/report-chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchQueryState } from '@/hooks/use-searcg-query-state';
import { useDebounceValue } from '@/hooks/useDebounceValue';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { memo } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/references',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.dashboard.list.queryOptions({
        projectId: params.projectId,
      }),
    );
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0),
  );
  const { search, setSearch } = useSearchQueryState();
  const query = useQuery(
    trpc.reference.getReferences.queryOptions(
      {
        projectId,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );
  const data = query.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="References"
        description="References is a good way to keep track of important events. They will show up in your reports."
        className="mb-8"
      />
      <TableButtons>
        <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
          <span className="max-sm:hidden">Create reference</span>
          <span className="sm:hidden">Reference</span>
        </Button>
        <div>
          <Input
            className="self-auto"
            placeholder="Search reference"
            value={search ?? ''}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(0);
            }}
          />
        </div>
      </TableButtons>
      <ReferencesTable data={data} />
    </PageContainer>
  );
}
