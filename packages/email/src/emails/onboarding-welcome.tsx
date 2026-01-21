import { Heading, Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';
import { List } from '../components/list';

export const zOnboardingWelcome = z.object({
  firstName: z.string().optional(),
  dashboardUrl: z.string(),
});

export type Props = z.infer<typeof zOnboardingWelcome>;
export default OnboardingWelcome;
export function OnboardingWelcome({ firstName }: Props) {
  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>Thanks for trying OpenPanel.</Text>
      <Text>
        We built OpenPanel because most analytics tools are either too
        expensive, too complicated, or both. OpenPanel is different.
      </Text>
      <Text>
        We hope you find OpenPanel useful and if you have any questions,
        regarding tracking or how to import your existing events, just reach
        out. We're here to help.
      </Text>
      <Text>To get started, you can:</Text>
      <List
        items={[
          <Link
            key=""
            href={'https://openpanel.dev/docs/get-started/install-openpanel'}
          >
            Install tracking script
          </Link>,
          <Link
            key=""
            href={'https://openpanel.dev/docs/get-started/track-events'}
          >
            Start tracking your events
          </Link>,
        ]}
      />
      <Text>
        Best regards,
        <br />
        Carl
      </Text>
    </Layout>
  );
}
