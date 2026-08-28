import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zWindDownBlocked = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  deleteDate: z.string(),
  hasData: z.boolean().default(true),
  stillTracking: z.boolean().default(false),
  eventsCount: z.number().optional(),
  recentEventsCount: z.number().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zWindDownBlocked>;
export default WindDownBlocked;
export function WindDownBlocked({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  deleteDate,
  hasData = true,
  stillTracking = false,
  eventsCount,
  recentEventsCount,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const greeting = <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>;
  const cta = (
    <Text>
      <Button href={withUtm(billingUrl, 'wind-down-blocked')}>
        Resume tracking
      </Button>
    </Text>
  );

  if (stillTracking) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        {greeting}
        <Text>
          As of today we've stopped recording events from your projects.
          {recentEventsCount
            ? ` Your SDKs are still sending — around ${formatEvents(recentEventsCount)} events over the last month — and from now on those requests are discarded.`
            : ' Your SDKs will keep sending; those requests are now discarded.'}
        </Text>
        <Text>
          Nothing has been deleted.
          {eventsCount
            ? ` The ${formatEvents(eventsCount)} events collected before today are intact`
            : ' Everything collected before today is intact'}{' '}
          and waiting. Subscribe and recording resumes within a few minutes,
          with your full history where you left it — though the gap from today
          onward can't be backfilled.
        </Text>
        {cta}
        <Text>
          Being straight about what comes next: if the workspace is still
          inactive on {deleteDate}, it and its data get removed. I'll send one
          more email well before that.
        </Text>
        <Text>
          If pricing is the problem, reply — I'd rather find something that
          works than lose the data.
        </Text>
        <Text>Carl</Text>
      </Layout>
    );
  }

  if (hasData) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        {greeting}
        <Text>
          As of today your projects no longer accept new events. Nothing has
          been deleted —
          {eventsCount
            ? ` the ${formatEvents(eventsCount)} events already collected are intact`
            : ' everything already collected is intact'}{' '}
          and a plan brings it all straight back.
        </Text>
        {cta}
        <Text>
          If the workspace is still inactive on {deleteDate}, it and its data
          get removed. I'll send one more email before that happens.
        </Text>
        <Text>Carl</Text>
      </Layout>
    );
  }

  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      {greeting}
      <Text>
        Your workspace is now closed to new events. Nothing was ever tracked in
        it, so this is mostly housekeeping on my end.
      </Text>
      <Text>
        It stays recoverable until {deleteDate}. Pick a plan before then and it
        comes straight back.
      </Text>
      {cta}
      <Text>Carl</Text>
    </Layout>
  );
}

WindDownBlocked.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  deleteDate: 'April 10',
  hasData: true,
  stillTracking: true,
  eventsCount: 842_110,
  recentEventsCount: 128_400,
};
