import { Button } from '@/components/ui/button';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ActivityIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { EventListItem } from '../events/event-list-item';
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

  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && scrollRef.current) {
      scrollRef.current.style.height = `${ref.current?.getBoundingClientRect().height}px`;
    }
  }, [query.data?.data?.length]);

  return (
    <Widget className="w-full overflow-hidden h-full" ref={ref}>
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>Latest Events</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button variant="outline" size="sm" onClick={handleShowMore}>
            All
          </Button>
        </WidgetAbsoluteButtons>
      </WidgetHead>

      <ScrollArea ref={scrollRef} className="h-0 p-4">
        {query.data?.data?.map((event) => (
          <div key={event.id} className="mb-4">
            <EventListItem {...event} />
          </div>
        ))}
      </ScrollArea>
    </Widget>
  );
};
