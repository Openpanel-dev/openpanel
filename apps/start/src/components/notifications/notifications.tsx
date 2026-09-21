import { useQuery } from '@tanstack/react-query';
import { NotificationsTable } from './table';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';

export function Notifications() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.notification.list.queryOptions({
      projectId,
    })
  );

  return <NotificationsTable query={query} />;
}
