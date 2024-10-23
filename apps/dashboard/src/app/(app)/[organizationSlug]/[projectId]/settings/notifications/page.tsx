import { NotificationRules } from '@/components/notifications/notification-rules';
import { Notifications } from '@/components/notifications/notifications';
import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { parseAsStringEnum } from 'nuqs/server';

interface PageProps {
  params: {
    projectId: string;
  };
  searchParams: {
    tab: string;
  };
}

export default function Page({
  params: { projectId },
  searchParams,
}: PageProps) {
  const tab = parseAsStringEnum(['notifications', 'rules'])
    .withDefault('notifications')
    .parseServerSide(searchParams.tab);
  return (
    <Padding>
      <PageTabs className="mb-4">
        <PageTabsLink
          href="?tab=notifications"
          isActive={tab === 'notifications'}
        >
          Notifications
        </PageTabsLink>
        <PageTabsLink href="?tab=rules" isActive={tab === 'rules'}>
          Rules
        </PageTabsLink>
      </PageTabs>
      {tab === 'notifications' && <Notifications />}
      {tab === 'rules' && <NotificationRules />}
    </Padding>
  );
}
