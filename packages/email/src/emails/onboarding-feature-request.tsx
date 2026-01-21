import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zOnboardingFeatureRequest = z.object({
  firstName: z.string().optional(),
});

export type Props = z.infer<typeof zOnboardingFeatureRequest>;
export default OnboardingFeatureRequest;
export function OnboardingFeatureRequest({ firstName }: Props) {
  return (
    <Layout>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      <Text>
        OpenPanel aims to be the one stop shop for all your analytics needs.
      </Text>
      <Text>
        We have already in a very short time become one of the most popular
        open-source analytics platforms out there and we're working hard to add
        more features to make it the best analytics platform.
      </Text>
      <Text>
        Do you feel like you're missing a feature that's important to you? If
        that's the case, please reply here or go to our feedback board and add
        your request there.
      </Text>
      <Text>
        <Link href={'https://feedback.openpanel.dev'}>Feedback board</Link>
      </Text>
      <Text>
        Best regards,
        <br />
        Carl
      </Text>
    </Layout>
  );
}
