import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zTrackingDataStopped = z.object({
  firstName: z.string().optional(),
  projectNames: z.array(z.string()).min(1),
  lastEventDate: z.string().optional(),
  dashboardUrl: z.string(),
});

export type Props = z.infer<typeof zTrackingDataStopped>;
export default TrackingDataStopped;
export function TrackingDataStopped({
  firstName,
  projectNames,
  lastEventDate,
  dashboardUrl = 'https://dashboard.openpanel.dev',
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const single = projectNames.length === 1;
  const names = projectNames.join(', ');
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        {single
          ? `Your project ${names} stopped`
          : `Your projects (${names}) stopped`}{' '}
        sending events
        {lastEventDate
          ? ` — the last one arrived on ${lastEventDate}`
          : ' about a week ago'}
        .
      </Text>
      <Text>
        This usually isn't intentional: a deploy that dropped the tracking
        snippet, a changed client ID, or a new domain that isn't in your allowed
        origins. Worth a quick check so you don't end up with a gap in your
        data.
      </Text>
      <Text>
        <Button href={withUtm(dashboardUrl, 'tracking-data-stopped')}>
          Check your project
        </Button>
      </Text>
      <Text>
        The{' '}
        <Link
          href={withUtm(
            'https://openpanel.dev/docs/get-started/install-openpanel',
            'tracking-data-stopped'
          )}
        >
          install guide
        </Link>{' '}
        covers a re-install for every framework. If it stopped on purpose — no
        action needed, and sorry for the noise. Otherwise, reply and I'll help
        you debug it.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

TrackingDataStopped.PreviewProps = {
  firstName: 'Alex',
  projectNames: ['My website'],
  lastEventDate: 'August 14',
  dashboardUrl: 'https://dashboard.openpanel.dev/org-id',
};
