import { Container } from "@/components/Container";
import { PageTitle } from "@/components/PageTitle";
import { usePagination } from "@/components/Pagination";
import { EventsTable } from "@/components/events/EventsTable";
import { MainLayout } from "@/components/layouts/MainLayout";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { useQueryParams } from "@/hooks/useQueryParams";
import { api } from "@/utils/api";

import { useMemo } from "react";
import { z } from "zod";

export default function ProfileId() {
  const pagination = usePagination();
  const params = useOrganizationParams();
  const { profileId } = useQueryParams(
    z.object({
      profileId: z.string(),
    }),
  );
  const eventsQuery = api.event.list.useQuery(
    {
      projectSlug: params.project,
      profileId,
      ...pagination,
    },
    {
      keepPreviousData: true,
    },
  );
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery]);

  return (
    <MainLayout>
      <Container>
        <PageTitle>Profile</PageTitle>
        <EventsTable data={events} pagination={pagination} />
      </Container>
    </MainLayout>
  );
}
