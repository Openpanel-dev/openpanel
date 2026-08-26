import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zTrackingNoData = z.object({
  firstName: z.string().optional(),
  projectNames: z.array(z.string()).min(1),
  dashboardUrl: z.string(),
});

export type Props = z.infer<typeof zTrackingNoData>;
export default TrackingNoData;
export function TrackingNoData({
  firstName,
  projectNames,
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
          ? `Your project ${names} hasn't`
          : `Your projects (${names}) haven't`}{' '}
        received any events yet — which usually means the tracking snippet isn't
        installed, or something is blocking it.
      </Text>
      <Text>
        The most common fixes: the snippet isn't on the page (or not deployed
        yet), the client ID doesn't match, or the domain isn't in your allowed
        origins.
      </Text>
      <Text>
        <Button href={withUtm(dashboardUrl, 'tracking-no-data')}>
          Verify your install
        </Button>
      </Text>
      <Text>
        Framework-specific instructions are in the{' '}
        <Link
          href={withUtm(
            'https://openpanel.dev/docs/get-started/install-openpanel',
            'tracking-no-data'
          )}
        >
          install guide
        </Link>
        . And if you've tried and it still doesn't work, reply to this email —
        I'll personally help you get it running.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

TrackingNoData.PreviewProps = {
  firstName: 'Alex',
  projectNames: ['My website'],
  dashboardUrl: 'https://dashboard.openpanel.dev/org-id',
};
