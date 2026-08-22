import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zUsageNearLimit = z.object({
  firstName: z.string().optional(),
  organizationName: z.string(),
  billingUrl: z.string(),
  eventsCount: z.number(),
  eventsLimit: z.number(),
});

const formatNumber = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zUsageNearLimit>;
export default UsageNearLimit;
export function UsageNearLimit({
  firstName,
  organizationName,
  billingUrl = 'https://dashboard.openpanel.dev',
  eventsCount,
  eventsLimit,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const percent = Math.round((eventsCount / eventsLimit) * 100);
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        Heads up: {organizationName} has used {formatNumber(eventsCount)} of its{' '}
        {formatNumber(eventsLimit)} monthly events ({percent}%).
      </Text>
      <Text>
        If you go over the limit, we keep collecting every event — nothing is
        lost — but your charts stop showing new data until you upgrade or the
        next billing cycle starts.
      </Text>
      <Text>
        <Button href={withUtm(billingUrl, 'usage-near-limit')}>
          See usage &amp; plans
        </Button>
      </Text>
      <Text>
        Questions about which plan fits? Reply to this email and I'll help you
        pick.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

UsageNearLimit.PreviewProps = {
  firstName: 'Alex',
  organizationName: 'Acme',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  eventsCount: 4200,
  eventsLimit: 5000,
};
