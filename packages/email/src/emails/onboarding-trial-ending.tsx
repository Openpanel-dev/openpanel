import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';

export const zOnboardingTrialEnding = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  recommendedPlan: z.string().optional(),
  trialEndDate: z.string().optional(),
  hasData: z.boolean().default(true),
  eventsCount: z.number().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zOnboardingTrialEnding>;
export default OnboardingTrialEnding;
export function OnboardingTrialEnding({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  recommendedPlan,
  trialEndDate,
  hasData = true,
  eventsCount,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const newUrl = new URL(billingUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-trial-ending');

  const endsOn = trialEndDate ? `on ${trialEndDate}` : 'in a few days';

  if (!hasData) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
        <Text>
          Your trial ends {endsOn}, and since your project never received any
          events, there's nothing here for you to lose.
        </Text>
        <Text>
          If the timing was just off, you can install now and use the last few
          days to see if it's useful:{' '}
          <Link
            href={'https://openpanel.dev/docs/get-started/install-openpanel'}
          >
            install guide
          </Link>
          .
        </Text>
        <Text>
          If you tried and something didn't work, reply and I'll help you sort
          it out before the trial runs out.
        </Text>
        <Text>Carl</Text>
      </Layout>
    );
  }

  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        Your trial ends {endsOn}.
        {eventsCount
          ? ` Here's where you stand: ${formatEvents(eventsCount)} events tracked during the trial.`
          : ''}
      </Text>
      <Text>
        {recommendedPlan
          ? `At that volume, the plan that fits is ${recommendedPlan}.`
          : 'Plans start at $2.50 a month.'}{' '}
        If you upgrade, nothing changes: same dashboards, same data. If you
        don't, your dashboard locks when the trial ends, and eventually the
        workspace is removed.
      </Text>
      <Text>
        <Button href={newUrl.toString()}>Upgrade</Button>
      </Text>
      <Text>
        If something is holding you back, reply and tell me. I'd rather fix the
        reason than send you another reminder.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

OnboardingTrialEnding.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  recommendedPlan: '100K events per month for $20.00',
  trialEndDate: 'June 16',
  hasData: true,
  eventsCount: 84211,
};
