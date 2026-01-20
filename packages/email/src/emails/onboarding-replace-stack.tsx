import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zOnboardingReplaceStack = z.object({
  firstName: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingReplaceStack>;
export default OnboardingReplaceStack;
export function OnboardingReplaceStack({
  firstName,
}: Props) {
  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        A lot of people who sign up are using multiple tools: something for
        traffic, something for product analytics and something else for seeing
        raw events.
      </Text>
      <Text>OpenPanel can replace that whole setup.</Text>
      <Text>
        If you're still thinking of web analytics and product analytics as
        separate things, try combining them in a single dashboard. Traffic
        sources on top, user behavior below. That view tends to be more useful
        than either one alone.
      </Text>
      <Text>
        OpenPanel should be able to replace all of them, you can just reach out
        if you feel like something is missing.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}
