import { useQueryClient } from '@tanstack/react-query';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';

type Props = {
  projectId: string;
};

const RealtimeReloader = ({ projectId }: Props) => {
  const client = useQueryClient();
  const trpc = useTRPC();

  useWS<number>(
    `/live/events/${projectId}`,
    () => {
      if (!document.hidden) {
        // pathFilter() covers all realtime.* queries for this project
        client.refetchQueries(trpc.realtime.pathFilter());
        client.refetchQueries(
          trpc.overview.liveData.queryFilter({ projectId })
        );
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 60_000,
      },
    }
  );

  return null;
};

export default RealtimeReloader;
