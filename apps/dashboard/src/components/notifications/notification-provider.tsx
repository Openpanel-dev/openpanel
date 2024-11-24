import { useAppParams } from '@/hooks/useAppParams';
import useWS from '@/hooks/useWS';
import type { Notification } from '@openpanel/db';
import { BellIcon } from 'lucide-react';
import { toast } from 'sonner';

export function NotificationProvider() {
  const { projectId } = useAppParams();

  if (!projectId) return null;

  return <InnerNotificationProvider projectId={projectId} />;
}

export function InnerNotificationProvider({
  projectId,
}: { projectId: string }) {
  useWS<Notification>(`/live/notifications/${projectId}`, (notification) => {
    toast(notification.title, {
      description: notification.message,
      icon: <BellIcon className="size-4" />,
    });
  });

  return null;
}
