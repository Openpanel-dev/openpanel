'use client';

import { EventsTable } from '@/components/events/table';
import { api } from '@/trpc/client';

type Props = {
  projectId: string;
  profileId?: string;
};

const Conversions = ({ projectId }: Props) => {
  const query = api.event.conversions.useQuery(
    {
      projectId,
    },
    {
      keepPreviousData: true,
    },
  );

  return <EventsTable query={query} />;
};

export default Conversions;
