import { useMemo, useState } from 'react';
import { Container } from '@/components/Container';
import { EventsTable } from '@/components/events/EventsTable';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { Pagination, usePagination } from '@/components/Pagination';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { useQueryParams } from '@/hooks/useQueryParams';
import { api } from '@/utils/api';
import { getProfileName } from '@/utils/getters';
import { z } from 'zod';

export default function ProfileId() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const { profileId } = useQueryParams(
    z.object({
      profileId: z.string(),
    })
  );
  const [eventFilters, setEventFilters] = useState<string[]>([]);
  const filterEventsQuery = api.chart.events.useQuery({
    projectSlug: params.project,
  });
  const filterEvents = (filterEventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));
  const profileQuery = api.profile.get.useQuery({
    id: profileId,
  });
  const eventsQuery = api.event.list.useQuery(
    {
      projectSlug: params.project,
      profileId,
      events: eventFilters,
      ...pagination,
    },
    {
      keepPreviousData: true,
    }
  );
  const profile = profileQuery.data ?? null;
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  return (
    <MainLayout>
      <Container>
        <PageTitle>{getProfileName(profile)}</PageTitle>
        <pre>{JSON.stringify(profile?.properties, null, 2)}</pre>
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
