import { Button } from '@/components/ui/button';
import { Widget } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ActivityIcon } from 'lucide-react';
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

  const events = query.data?.data ?? [];

  // The previous implementation measured the widget's own height in a
  // useEffect and pushed that onto the ScrollArea — which collapsed to
  // zero whenever the CSS grid around this card had a shorter row (see
  // the profile detail layout). Using a capped max-height here avoids
  // that whole circular measurement and scrolls cleanly inside a fixed
  // window instead.
  return (
    <Widget className="w-full overflow-hidden h-full">
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>Latest Events</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button variant="outline" size="sm" onClick={handleShowMore}>
            All
          </Button>
        </WidgetAbsoluteButtons>
      </WidgetHead>

      <ScrollArea className="max-h-[420px] p-4">
        {events.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No events for this profile yet.
          </div>
        ) : (
          // On a profile's own detail page every row is the same
          // person, so we hide the profile name/link on each item —
          // otherwise it's the same name repeated five times.
          events.map((event) => (
            <div key={event.id} className="mb-4">
              <EventListItem {...event} hideProfile />
            </div>
          ))
        )}
      </ScrollArea>
    </Widget>
  );
};
