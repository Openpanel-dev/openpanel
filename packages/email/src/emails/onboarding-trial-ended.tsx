import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';

export const zOnboardingTrialEnded = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  recommendedPlan: z.string().optional(),
  hasData: z.boolean().default(true),
  eventsCount: z.number().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zOnboardingTrialEnded>;
export default OnboardingTrialEnded;
export function OnboardingTrialEnded({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  recommendedPlan,
  hasData = true,
  eventsCount,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const newUrl = new URL(billingUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-trial-ended');

  if (!hasData) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
        <Text>
          Your trial ended today. No events ever came in, so nothing is lost.
          The empty workspace will be cleaned up and that's the end of it.
        </Text>
        <Text>
          If you want to give OpenPanel another go some day, it'll be here. And
          if you remember what made you bounce, I'd like to hear it. One line
          is fine.
        </Text>
        <Text>Carl</Text>
      </Layout>
    );
  }

  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Your trial ended today, so your dashboard is locked.</Text>
      <Text>
        Your data isn't gone.
        {eventsCount
          ? ` The ${formatEvents(eventsCount)} events you tracked are still stored, and incoming events are still accepted for now.`
          : ' Everything you tracked is still stored, and incoming events are still accepted for now.'}{' '}
        Upgrade and everything picks up where it left off.
      </Text>
      <Text>
        {recommendedPlan
          ? `Based on your volume: ${recommendedPlan}.`
          : 'Plans start at $2.50 a month.'}
      </Text>
      <Text>
        <Button href={newUrl.toString()}>Upgrade</Button>
      </Text>
      <Text>
        If you don't upgrade, the workspace is eventually removed along with
        its data. I'm saying that plainly so it's not a surprise, not to
        pressure you.
      </Text>
      <Text>
        If OpenPanel wasn't right for you, a one-line reply saying why helps me
        more than you'd think.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

OnboardingTrialEnded.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  recommendedPlan: '100K events per month for $20.00',
  hasData: true,
  eventsCount: 84211,
};
