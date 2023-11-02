import { useMemo } from 'react';
import { Container } from '@/components/Container';
import { EventsTable } from '@/components/events/EventsTable';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { usePagination } from '@/components/Pagination';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { api } from '@/utils/api';

export default function Events() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const eventsQuery = api.event.list.useQuery(
    {
      projectSlug: params.project,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  return (
    <MainLayout>
      <Container>
        <PageTitle>Events</PageTitle>
        <EventsTable data={events} pagination={pagination} />
      </Container>
    </MainLayout>
  );
}
