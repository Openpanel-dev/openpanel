'use client';

import { Button } from '@/components/ui/button';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ActivityIcon } from 'lucide-react';
import { EventsViewOptions, useEventsViewOptions } from '../events/table';
import { EventItem } from '../events/table/item';
import {
  WidgetAbsoluteButtons,
  WidgetHead,
  WidgetTitle,
} from '../overview/overview-widget';
import { ScrollArea } from '../ui/scroll-area';

type Props = {
  profileId: string;
  projectId: string;
  organizationId: string;
};

export const LatestEvents = ({
  profileId,
  projectId,
  organizationId,
}: Props) => {
  const [viewOptions] = useEventsViewOptions();
  const router = useRouter();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.event.events.queryOptions({
      projectId,
      profileId,
    }),
  );

  const handleShowMore = () => {
    router.navigate({
      to: '/$organizationId/$projectId/profiles/$profileId/events',
      params: {
        organizationId,
        projectId,
        profileId,
      },
    });
  };

  return (
    <Widget className="w-full overflow-hidden">
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>Latest Events</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button variant="outline" size="sm" onClick={handleShowMore}>
            All
          </Button>
          <EventsViewOptions />
        </WidgetAbsoluteButtons>
      </WidgetHead>

      <ScrollArea className="h-72">
        {query.data?.data?.map((event) => (
          <EventItem
            className="border-0 rounded-none border-b last:border-b-0 [&_[data-slot='inner']]:px-4"
            key={event.id}
            event={event}
            viewOptions={viewOptions}
          />
        ))}
      </ScrollArea>
    </Widget>
  );
};
