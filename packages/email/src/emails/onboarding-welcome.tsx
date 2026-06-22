import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';
import { List } from '../components/list';
import { withUtm } from '../utm';

export const zOnboardingWelcome = z.object({
  firstName: z.string().optional(),
  dashboardUrl: z.string(),
  hasData: z.boolean().default(false),
});

export type Props = z.infer<typeof zOnboardingWelcome>;
export default OnboardingWelcome;
export function OnboardingWelcome({
  firstName,
  dashboardUrl = 'https://dashboard.openpanel.dev',
  hasData = false,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Carl here. I build OpenPanel. Thanks for signing up.</Text>
      <Text>
        Your trial runs for 30 days with everything included. No card needed
        until you decide to stay.
      </Text>
      {hasData ? (
        <>
          <Text>
            Events are already coming in, so you're past the hard part. Have a
            look around your dashboard and reply if anything looks off.
          </Text>
          <Text>
            <Link href={withUtm(dashboardUrl, 'onboarding-welcome')}>
              Open your dashboard
            </Link>
          </Text>
        </>
      ) : (
        <>
          <Text>
            First step is getting data in. The install usually takes a few
            minutes:
          </Text>
          <List
            items={[
              <Link
                key="install"
                href={withUtm(
                  'https://openpanel.dev/docs/get-started/install-openpanel',
                  'onboarding-welcome',
                )}
              >
                Install the tracking script
              </Link>,
              <Link
                key="track"
                href={withUtm(
                  'https://openpanel.dev/docs/get-started/track-events',
                  'onboarding-welcome',
                )}
              >
                Track custom events
              </Link>,
            ]}
          />
          <Text>If you get stuck, just reply to this email.</Text>
        </>
      )}
      <Text>Carl</Text>
    </Layout>
  );
}

OnboardingWelcome.PreviewProps = {
  firstName: 'Alex',
  dashboardUrl: 'https://dashboard.openpanel.dev/org-id',
  hasData: false,
};
