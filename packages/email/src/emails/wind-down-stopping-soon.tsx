import { Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zWindDownStoppingSoon = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  blockDate: z.string(),
  recommendedPlan: z.string().optional(),
  hasData: z.boolean().default(true),
  stillTracking: z.boolean().default(false),
  eventsCount: z.number().optional(),
  recentEventsCount: z.number().optional(),
  projectNames: z.array(z.string()).default([]),
  highlight: z.string().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zWindDownStoppingSoon>;
export default WindDownStoppingSoon;
export function WindDownStoppingSoon({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  blockDate,
  recommendedPlan,
  hasData = true,
  stillTracking = false,
  eventsCount,
  recentEventsCount,
  highlight,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const greeting = <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>;
  const cta = (
    <Text>
      <Button href={withUtm(billingUrl, 'wind-down-stopping-soon')}>
        Keep tracking
      </Button>
    </Text>
  );

  if (stillTracking) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        {greeting}
        <Text>
          One week left: on {blockDate} we stop recording events from your
          projects.
        </Text>
        <Text>
          {recentEventsCount
            ? `You're sending roughly ${formatEvents(recentEventsCount)} events a month right now. `
            : "You're still sending events. "}
          All of that stops being recorded on {blockDate} — the requests will
          still go out, they just won't land anywhere. Whatever you'd want to
          look back on later starts missing from that date.
        </Text>
        {highlight ? <Text>{highlight}</Text> : null}
        <Text>
          {recommendedPlan
            ? `Keeping it running costs ${recommendedPlan}.`
            : 'Plans start at $2.50 a month.'}{' '}
          Nothing about your setup changes — no redeploy, no new keys.
        </Text>
        {cta}
        <Text>
          Need longer, or want to talk through which plan fits? Reply and I'll
          sort it out.
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
          A heads-up with a date on it: on {blockDate} we stop accepting events
          from your projects, and the workspace starts winding down.
        </Text>
        <Text>
          Everything already collected stays put for now
          {eventsCount ? `, all ${formatEvents(eventsCount)} events of it` : ''}
          . If you want to keep it, a plan before {blockDate} keeps everything
          exactly as it is.
        </Text>
        {cta}
        <Text>Carl</Text>
      </Layout>
    );
  }

  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      {greeting}
      <Text>
        Quick follow-up: your trial ended a couple of weeks ago and the
        workspace is still empty, so I'll be closing it on {blockDate}.
      </Text>
      <Text>
        If you'd rather keep it, picking a plan stops the clock. Otherwise you
        can ignore this — I'll send one more note before anything goes.
      </Text>
      {cta}
      <Text>Carl</Text>
    </Layout>
  );
}

WindDownStoppingSoon.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  blockDate: 'March 14',
  recommendedPlan: '100K events per month for $20.00',
  hasData: true,
  stillTracking: true,
  eventsCount: 842_110,
  recentEventsCount: 128_400,
  projectNames: ['acme-web'],
  highlight:
    'acme-web had 12,400 visitors in the last 30 days, peaking at 840 on November 12 — and /pricing was the page they visited most.',
};
