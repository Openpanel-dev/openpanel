import { useQuery } from '@tanstack/react-query';
import { FileTextIcon } from 'lucide-react';
import { LiveFeed, LiveFeedItem } from './live-feed';
import { useRealtimeFilters } from './use-realtime-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';

export function LiveTopPages({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const number = useNumber();
  const { filters } = useRealtimeFilters();
  const query = useQuery(
    trpc.realtime.topPages.queryOptions({ projectId, filters })
  );

  return (
    <LiveFeed
      emptyText={query.isSuccess ? 'No page views right now' : undefined}
      items={query.data ?? []}
      renderItem={(page) => (
        <LiveFeedItem
          icon={<FileTextIcon className="size-3.5 text-muted-foreground" />}
          title={page.path}
          trailing={<span>{number.format(page.sessions)}</span>}
        />
      )}
      storageKey="pages"
      title="Top pages"
    />
  );
}
