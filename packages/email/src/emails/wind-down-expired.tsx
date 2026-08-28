import { Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Button } from '../components/button';
import { Layout } from '../components/layout';
import { withUtm } from '../utm';

export const zWindDownExpired = z.object({
  firstName: z.string().optional(),
  billingUrl: z.string(),
  blockDate: z.string(),
  trialEndedDate: z.string().optional(),
  recommendedPlan: z.string().optional(),
  hasData: z.boolean().default(true),
  /** SDKs are demonstrably still sending, months after the trial lapsed. */
  stillTracking: z.boolean().default(false),
  eventsCount: z.number().optional(),
  recentEventsCount: z.number().optional(),
  projectNames: z.array(z.string()).default([]),
  /**
   * AI-written (or deterministic-fallback) paragraph of concrete facts from
   * the org's own recent data. Only present for still-tracking orgs above the
   * volume threshold — see win-back-highlight.ts in the worker.
   */
  highlight: z.string().optional(),
});

const formatEvents = (count: number) =>
  new Intl.NumberFormat('en-US').format(count);

export type Props = z.infer<typeof zWindDownExpired>;
export default WindDownExpired;
export function WindDownExpired({
  firstName,
  billingUrl = 'https://dashboard.openpanel.dev',
  blockDate,
  trialEndedDate,
  recommendedPlan,
  hasData = true,
  stillTracking = false,
  eventsCount,
  recentEventsCount,
  projectNames = [],
  highlight,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  const greeting = <Text>Hi{firstName ? ` ${firstName}` : ''},</Text>;
  const projectLabel =
    projectNames.length === 1
      ? projectNames[0]
      : projectNames.length > 1
        ? `${projectNames[0]} and ${projectNames.length - 1} more`
        : undefined;
  const mcpPitch = (
    <Text>
      A lot has shipped since your trial — including our{' '}
      <Link href={withUtm('https://openpanel.dev/docs/mcp', 'wind-down-expired')}>
        MCP server
      </Link>
      : connect Claude, Cursor, or any MCP client and ask questions about this
      data in plain English.
    </Text>
  );
  const cta = (
    <Text>
      <Button href={withUtm(billingUrl, 'wind-down-expired')}>
        Choose a plan
      </Button>
    </Text>
  );

  // Still sending. The persuasive fact is the live volume, not the history.
  if (stillTracking) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        {greeting}
        <Text>
          Your OpenPanel tracking is still running
          {trialEndedDate ? `, even though your trial ended ${trialEndedDate}` : ''}
          .
          {recentEventsCount
            ? ` You've sent ${formatEvents(recentEventsCount)} events in the last 30 days and we've recorded every one of them.`
            : ' Your SDKs are still sending and we are still recording.'}
        </Text>
        {highlight ? <Text>{highlight}</Text> : null}
        <Text>
          I'd rather tell you than let it lapse quietly: on {blockDate} we stop
          accepting events from your projects. Your SDKs will keep firing, but
          nothing will be recorded, and your history gets a permanent gap
          starting that day.
        </Text>
        <Text>
          {recommendedPlan
            ? `For what you're actually sending, that's ${recommendedPlan}.`
            : 'Plans start at $2.50 a month.'}{' '}
          Subscribe before {blockDate} and nothing changes — same data, same
          setup, dashboard unlocked.
        </Text>
        {cta}
        {mcpPitch}
        <Text>
          If the price is the blocker, or you only need part of what you're
          sending, reply and we'll work something out.
        </Text>
        <Text>Carl</Text>
      </Layout>
    );
  }

  // Tracked at some point, but nothing recent.
  if (hasData) {
    return (
      <Layout unsubscribeUrl={unsubscribeUrl}>
        {greeting}
        <Text>
          Your trial ended{trialEndedDate ? ` ${trialEndedDate}` : ''}, so the
          dashboard is locked. Your data
          {projectLabel ? ` from ${projectLabel}` : ''} is still here —
          {eventsCount
            ? ` all ${formatEvents(eventsCount)} events of it.`
            : ' everything you tracked is stored.'}
        </Text>
        <Text>
          Nothing has been sent in a while, so I'm assuming you moved on. If
          that's right you can ignore this; I'll close the workspace down over
          the next few weeks and send a reminder before anything is removed.
        </Text>
        <Text>
          If you'd rather pick it back up,{' '}
          {recommendedPlan
            ? `a plan for your volume is ${recommendedPlan}`
            : 'plans start at $2.50 a month'}{' '}
          and everything resumes where it left off.
        </Text>
        {cta}
        {mcpPitch}
        <Text>Carl</Text>
      </Layout>
    );
  }

  // Never sent an event.
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      {greeting}
      <Text>
        Your OpenPanel trial has ended. No events ever reached us, so there's
        nothing stored and nothing for you to lose.
      </Text>
      <Text>
        I'll close the workspace down over the next few weeks unless you pick a
        plan. You'll get a reminder before anything is removed.
      </Text>
      {cta}
      <Text>
        If something got in the way during setup, I'd genuinely like to know.
        One line is plenty.
      </Text>
      <Text>Carl</Text>
    </Layout>
  );
}

WindDownExpired.PreviewProps = {
  firstName: 'Alex',
  billingUrl: 'https://dashboard.openpanel.dev/org-id/billing',
  blockDate: 'March 14',
  trialEndedDate: 'November 3, 2025',
  recommendedPlan: '100K events per month for $20.00',
  hasData: true,
  stillTracking: true,
  eventsCount: 842_110,
  recentEventsCount: 128_400,
  projectNames: ['acme-web', 'acme-docs'],
  highlight:
    'acme-web had 12,400 visitors in the last 30 days, peaking at 840 on November 12 — and /pricing was the page they visited most.',
};
