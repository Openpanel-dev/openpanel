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
import { Button } from '@/components/ui/button';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';

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
    })
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
    <Widget className="h-full w-full overflow-hidden" ref={ref}>
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>Latest Events</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button onClick={handleShowMore} size="sm" variant="outline">
            All
          </Button>
        </WidgetAbsoluteButtons>
      </WidgetHead>

      <ScrollArea className="h-0 p-4" ref={scrollRef}>
        {query.data?.data?.map((event) => (
          <div className="mb-4" key={event.id}>
            <EventListItem {...event} />
          </div>
        ))}
      </ScrollArea>
    </Widget>
  );
};
