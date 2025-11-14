import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { useQueryClient } from '@tanstack/react-query';

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
        client.refetchQueries(trpc.realtime.pathFilter());
        client.refetchQueries(
          trpc.overview.liveData.queryFilter({ projectId }),
        );
        client.refetchQueries(
          trpc.realtime.activeSessions.queryFilter({ projectId }),
        );
        client.refetchQueries(
          trpc.realtime.referrals.queryFilter({ projectId }),
        );
        client.refetchQueries(trpc.realtime.paths.queryFilter({ projectId }));
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 60000,
      },
    },
  );

  return null;
};

export default RealtimeReloader;
