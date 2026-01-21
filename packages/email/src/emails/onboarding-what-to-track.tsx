import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';
import { List } from '../components/list';

export const zOnboardingWhatToTrack = z.object({
  firstName: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingWhatToTrack>;
export default OnboardingWhatToTrack;
export function OnboardingWhatToTrack({ firstName }: Props) {
  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        Tracking can be overwhelming at first, and that's why its important to
        focus on what's matters. For most products, that's something like:
      </Text>
      <List
        items={[
          'Find good funnels to track (onboarding or checkout)',
          'Conversions (how many clicks your hero CTA)',
          'What did the user do after clicking the CTA',
        ]}
      />
      <Text>
        Start small and incrementally add more events as you go is usually the
        best approach.
      </Text>
      <Text>
        If you're not sure whether something's worth tracking, or have any
        questions, just reply here.
      </Text>
      <Text>
        Best regards,
        <br />
        Carl
      </Text>
    </Layout>
  );
}
