import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';

export const zOnboardingTrialEnding = z.object({
  firstName: z.string().optional(),
  organizationName: z.string(),
  billingUrl: z.string(),
  recommendedPlan: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingTrialEnding>;
export default OnboardingTrialEnding;
export function OnboardingTrialEnding({
  firstName,
  organizationName = 'your organization',
  billingUrl = 'https://dashboard.openpanel.dev',
  recommendedPlan,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const newUrl = new URL(billingUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-trial-ending');

  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Quick heads up: your OpenPanel trial ends soon.</Text>
      <Text>
        Your tracking will keep working, but you won't be able to see new data
        until you upgrade. Everything you've built so far (dashboards, reports,
        event history) stays intact.
      </Text>
      <Text>
        To continue using OpenPanel, you'll need to upgrade to a paid plan.{' '}
        {recommendedPlan
          ? `Based on your usage we recommend upgrading to the ${recommendedPlan} plan`
          : 'Plans start at $2.50/month'}
        .
      </Text>
      <Text>
        If something's holding you back, I'd like to hear about it. Just reply.
      </Text>
      <Text>
        Your project will recieve events for the next 30 days, if you haven't
        upgraded by then we'll remove your workspace and projects.
      </Text>
      <Text>
        <Button href={newUrl.toString()}>Upgrade Now</Button>
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
