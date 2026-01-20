import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zOnboardingDashboards = z.object({
  firstName: z.string().optional(),
  dashboardUrl: z.string(),
});

export type Props = z.infer<typeof zOnboardingDashboards>;
export default OnboardingDashboards;
export function OnboardingDashboards({
  firstName,
  dashboardUrl = 'https://dashboard.openpanel.dev',
}: Props) {
  const newUrl = new URL(dashboardUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-dashboards');

  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        Tracking events is the easy part. The value comes from actually looking
        at them.
      </Text>
      <Text>
        If you haven't yet, try building a simple dashboard. Pick one thing you
        care about and visualize it. Could be:
      </Text>
      <Text>
        - How many people sign up and then actually do something
      </Text>
      <Text>- Where users drop off in a flow (funnel)</Text>
      <Text>- Which pages lead to conversions (entry page → CTA)</Text>
      <Text>
        This is usually when people go from "I have analytics" to "I understand
        what's happening." It's a different feeling.
      </Text>
      <Text>Takes maybe 10 minutes to set up. Worth it.</Text>
      <Text>
        <Link href={newUrl.toString()}>Create your first dashboard</Link>
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
