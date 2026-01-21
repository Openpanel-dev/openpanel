import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';

export const zOnboardingTrialEnded = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  recommendedPlan: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingTrialEnded>;
export default OnboardingTrialEnded;
export function OnboardingTrialEnded({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  recommendedPlan,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const newUrl = new URL(billingUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-trial-ended');

  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Your OpenPanel trial has ended.</Text>
      <Text>
        Your tracking is still running in the background, but you won't be able
        to see any new data until you upgrade. All your dashboards, reports, and
        event history are still there waiting for you.
      </Text>
      <Text>
        Important: If you don't upgrade within 30 days, your workspace and
        projects will be permanently deleted.
      </Text>
      <Text>
        To keep your data and continue using OpenPanel, upgrade to a paid plan.{' '}
        {recommendedPlan
          ? `Based on your usage we recommend upgrading to the ${recommendedPlan}`
          : 'Plans start at $2.50/month'}
        .
      </Text>
      <Text>
        If you have any questions or something's holding you back, just reply to
        this email.
      </Text>
      <Text>
        <Button href={newUrl.toString()}>Upgrade Now</Button>
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
