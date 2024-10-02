'use client';

import { useAppParams } from '@/hooks/useAppParams';
import { api } from '@/trpc/client';
import { NotificationsTable } from './table';

export function Notifications() {
  const { projectId } = useAppParams();
  const query = api.notification.list.useQuery({
    projectId,
  });

  return <NotificationsTable query={query} />;
}
