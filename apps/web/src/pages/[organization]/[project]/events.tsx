import { useMemo, useState } from 'react';
import { Container } from '@/components/Container';
import { EventsTable } from '@/components/events/EventsTable';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { Pagination, usePagination } from '@/components/Pagination';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { api } from '@/utils/api';

export default function Events() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const [eventFilters, setEventFilters] = useState<string[]>([]);
  const eventsQuery = api.event.list.useQuery(
    {
      events: eventFilters,
      projectSlug: params.project,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  const filterEventsQuery = api.chart.events.useQuery({
    projectSlug: params.project,
  });
  const filterEvents = (filterEventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));

  return (
    <MainLayout>
      <Container>
        <PageTitle>Events</PageTitle>

        <div className="flex justify-between items-center">
          <div>
            <ComboboxAdvanced
              items={filterEvents}
              selected={eventFilters}
              setSelected={setEventFilters}
              placeholder="Filter by event"
            />
          </div>
          <Pagination {...pagination} />
        </div>
        <EventsTable data={events} />
        <Pagination {...pagination} />
      </Container>
    </MainLayout>
  );
}
