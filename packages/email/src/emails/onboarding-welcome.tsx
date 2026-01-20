import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zOnboardingWelcome = z.object({
  firstName: z.string().optional(),
  dashboardUrl: z.string(),
});

export type Props = z.infer<typeof zOnboardingWelcome>;
export default OnboardingWelcome;
export function OnboardingWelcome({
  firstName,
  dashboardUrl = 'https://dashboard.openpanel.dev',
}: Props) {
  const newUrl = new URL(dashboardUrl);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'onboarding-welcome');

  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Thanks for trying OpenPanel.</Text>
      <Text>
        We built OpenPanel because most analytics tools are either too expensive,
        too complicated, or both. OpenPanel is different.
      </Text>
      <Text>
        If you already have setup your tracking you should see your dashboard
        getting filled up. If you come from another provider and want to import
        your old events you can do that in our{' '}
        <Link href={newUrl.toString()}>project settings</Link>.
      </Text>
      <Text>
        If you can't find your provider just reach out and we'll help you out.
      </Text>
      <Text>Reach out if you have any questions. I answer all emails.</Text>
      <Text>Carl</Text>
    </Layout>
  );
}
