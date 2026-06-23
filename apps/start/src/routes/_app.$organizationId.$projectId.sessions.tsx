import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionsTable } from '@/components/sessions/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTableFilters } from '@/hooks/use-table-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/sessions'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.SESSIONS),
        },
      ],
    };
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { debouncedSearch } = useSearchQueryState();
  const [filters, setFilters] = useTableFilters('f');

  const query = useInfiniteQuery(
    trpc.session.list.infiniteQueryOptions(
      {
        projectId,
        take: 50,
        search: debouncedSearch,
        filters,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.next,
      }
    )
  );

  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description={t('sessions.page_description')}
        title={t('sessions.page_title')}
      />
      <SessionsTable query={query} />
    </PageContainer>
  );
}
