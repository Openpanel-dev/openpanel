import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zNotificationRule = z.object({
  title: z.string(),
  message: z.string(),
  projectName: z.string().optional(),
  dashboardUrl: z.string().optional(),
});

export type Props = z.infer<typeof zNotificationRule>;
export default NotificationRule;
export function NotificationRule({
  title,
  message,
  projectName,
  dashboardUrl,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>
        🔔 <strong>{title}</strong>
        {projectName ? ` — ${projectName}` : ''}
      </Text>
      <Text>{message}</Text>
      {dashboardUrl && (
        <Text>
          <Button href={withUtm(dashboardUrl, 'notification-rule')}>
            Open dashboard
          </Button>
        </Text>
      )}
      <Text>
        You're receiving this because a notification rule you set up matched.
        Manage rules under Notifications in your project.
      </Text>
    </Layout>
  );
}

NotificationRule.PreviewProps = {
  title: 'Conversion: Sign up completed',
  message: 'A user completed the sign-up funnel.',
  projectName: 'My website',
  dashboardUrl: 'https://dashboard.openpanel.dev/org-id/project-id',
};
