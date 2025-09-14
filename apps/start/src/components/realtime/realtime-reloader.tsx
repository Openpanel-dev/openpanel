'use client';

import useWS from '@/hooks/use-ws';
import { useQueryClient } from '@tanstack/react-query';

type Props = {
  projectId: string;
};

const RealtimeReloader = ({ projectId }: Props) => {
  const client = useQueryClient();

  useWS<number>(
    `/live/events/${projectId}`,
    () => {
      if (!document.hidden) {
        client.refetchQueries({
          type: 'active',
        });
      }
    },
    {
      debounce: {
        maxWait: 60000,
        delay: 60000,
      },
    },
  );

  return null;
};

export default RealtimeReloader;
