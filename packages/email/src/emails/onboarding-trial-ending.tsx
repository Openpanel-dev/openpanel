import { Button, Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
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
}: Props) {
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
        If OpenPanel has been useful, upgrading just keeps it going. Plans
        start at $2.50/month
        {recommendedPlan ? ` and based on your usage we recommend ${recommendedPlan}` : ''}
        .
      </Text>
      <Text>
        If something's holding you back, I'd like to hear about it. Just
        reply.
      </Text>
      <Text>
        Your project will recieve events for the next 30 days, if you haven't
        upgraded by then we'll remove your workspace and projects.
      </Text>
      <Text>
        <Button
          href={newUrl.toString()}
          style={{
            backgroundColor: '#0070f3',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '5px',
            textDecoration: 'none',
          }}
        >
          Upgrade Now
        </Button>
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
