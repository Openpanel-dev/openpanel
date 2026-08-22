import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zUsageLimitExceeded = z.object({
  firstName: z.string().optional(),
  organizationName: z.string(),
  billingUrl: z.string(),
  eventsLimit: z.number(),
});

const formatNumber = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zUsageLimitExceeded>;
export default UsageLimitExceeded;
export function UsageLimitExceeded({
  firstName,
  organizationName,
  billingUrl = 'https://dashboard.openpanel.dev',
  eventsLimit,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        {organizationName} has reached its monthly limit of{' '}
        {formatNumber(eventsLimit)} events.
      </Text>
      <Text>
        Important: we're still collecting every incoming event, so nothing is
        being lost. But your charts are paused at the moment you hit the limit —
        new data won't show until you upgrade or your next billing cycle starts.
      </Text>
      <Text>
        Upgrading takes a minute and unlocks everything collected in the
        meantime.
      </Text>
      <Text>
        <Button href={withUtm(billingUrl, 'usage-limit-exceeded')}>
          Upgrade your plan
        </Button>
      </Text>
      <Text>
        If this month was an outlier, you can also just wait for the cycle to
        reset. And if you're stuck between plans, reply and I'll help.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

UsageLimitExceeded.PreviewProps = {
  firstName: 'Alex',
  organizationName: 'Acme',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  eventsLimit: 5000,
};
