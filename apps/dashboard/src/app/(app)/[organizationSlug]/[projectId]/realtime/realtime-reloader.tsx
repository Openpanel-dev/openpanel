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

  useWS<number>(`/live/visitors/${projectId}`, (value) => {
    router.refresh();
    client.refetchQueries({
      type: 'active',
    });
  });

  return null;
};

export default RealtimeReloader;
