import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zOnboardingWhatToTrack = z.object({
  firstName: z.string().optional(),
  hasData: z.boolean().default(false),
  eventsCount: z.number().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zOnboardingWhatToTrack>;
export default OnboardingWhatToTrack;
export function OnboardingWhatToTrack({
  firstName,
  hasData = false,
  eventsCount,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>
      {hasData ? (
        <>
          <Text>
            Your tracking is live
            {eventsCount ? ` (${formatEvents(eventsCount)} events so far)` : ''}
            , so here's the advice I give everyone next.
          </Text>
          <Text>
            Don't try to track everything. Pick the one flow that decides
            whether your product works (signup, checkout, whatever it is) and
            set up a funnel for it. Two or three custom events is enough.
          </Text>
          <Text>
            Pageviews tell you people came. The funnel tells you whether they
            did the thing you built the product for.
          </Text>
          <Text>
            Not sure what's worth tracking for your product? Reply with what
            you're building and I'll give you a concrete suggestion.
          </Text>
        </>
      ) : (
        <>
          <Text>
            You created your OpenPanel account two days ago, but no events have
            come in yet.
          </Text>
          <Text>
            Usually that means the install didn't happen, or something is
            blocking the script. Both are quick to sort out:{' '}
            <Link
              href={withUtm(
                'https://openpanel.dev/docs/get-started/install-openpanel',
                'onboarding-what-to-track',
              )}
            >
              install guide
            </Link>
            .
          </Text>
          <Text>
            If something in the docs didn't make sense, reply and tell me where
            you got stuck. That helps me either way.
          </Text>
        </>
      )}
      <Text>Carl</Text>
    </Layout>
  );
}

OnboardingWhatToTrack.PreviewProps = {
  firstName: 'Alex',
  hasData: true,
  eventsCount: 12544,
};
