'use client';

import useWS from '@/hooks/useWS';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: string;
};

const RealtimeReloader = ({ projectId }: Props) => {
  const client = useQueryClient();
  const router = useRouter();

  useWS<number>(
    `/live/events/${projectId}`,
    () => {
      if (!document.hidden) {
        router.refresh();
        client.refetchQueries({
          type: 'active',
        });
      }
    },
    {
      debounce: {
        maxWait: 15000,
        delay: 15000,
      },
    },
  );

  return null;
};

export default RealtimeReloader;
