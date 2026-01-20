import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zOnboardingWhatToTrack = z.object({
  firstName: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingWhatToTrack>;
export default OnboardingWhatToTrack;
export function OnboardingWhatToTrack({
  firstName,
}: Props) {
  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        Track the moments that tell you whether your product is working. Track
        things that matters to your product the most and then you can easily
        create funnels or conversions reports to understand what happening.
      </Text>
      <Text>For most products, that's something like:</Text>
      <Text>- Signups</Text>
      <Text>
        - The first meaningful action (create something, send something, buy
        something)
      </Text>
      <Text>- Return visits</Text>
      <Text>
        You don't need 50 events. Five good ones will tell you more than fifty
        random ones.
      </Text>
      <Text>
        If you're not sure whether something's worth tracking, just ask. I'm
        happy to look at your setup.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
