import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import { MiniRevenue } from '@/components/dashboard-mock/minis';
import {
  MiniEventRows,
  MiniExportFiles,
  MiniProjectCard,
  MiniSessionsRevenue,
  MiniSlackPayment,
} from '@/components/dashboard-mock/revenue';
import { VisualMock } from '@/components/visual-mock';

const SERVER_CODE = [
  { text: '// in your payment webhook', tone: 'muted' as const },
  { text: 'await op.revenue(2900, {' },
  { text: "  plan: 'pro',", tone: 'string' as const },
  { text: '  profileId: customer.id,', tone: 'string' as const },
  { text: '});' },
];

const WEB_CODE = [
  { text: '// in the browser, before checkout', tone: 'muted' as const },
  { text: 'op.pendingRevenue(2900);' },
  { text: '' },
  { text: '// on the thank-you page', tone: 'muted' as const },
  { text: 'op.flushRevenue();' },
];

export function RevenueTrackingPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Send the amount with the event and it follows the user everywhere: which referrer paid for itself, which page sold, what a session was worth."
        title={data.hero.heading}
        visual={<VisualMock name="revenue-overview" />}
      />
      <Pillar
        description="Revenue is attributed to the session it happened in. So every table on the overview that ranks sessions can rank money instead: referrers, UTM campaigns, entry pages, countries."
        label="Attribution"
        points={[
          {
            title: 'Referrers and campaigns by revenue',
            text: 'A Revenue column with its share of the total, next to sessions.',
          },
          {
            title: 'Entry pages that sell',
            text: 'The page people landed on before they paid, not just the page they paid on.',
          },
          {
            title: 'On every overview chart',
            text: 'Pick Revenue as the metric, or see it as green bars behind visitors.',
          },
        ]}
        title="Revenue by source, page and campaign"
        visual={
          <VisualMock bleed="right" frame="inset" name="revenue-sources" />
        }
      />
      <Pillar
        description="Each payment lands on a profile and on a session. The profile page sums it up, the session list shows what each visit was worth, and the events list shows the amount on the row."
        label="Profiles and sessions"
        points={[
          {
            title: 'Lifetime revenue per profile',
            text: 'A Revenue tile next to events, sessions and conversions.',
          },
          {
            title: 'Revenue per session',
            text: 'The visit that paid, in the sessions table and on the session page.',
          },
          {
            title: 'Filter and group by it',
            text: 'revenue is a filter property, and "Sum of revenue" is a metric in any report.',
          },
        ]}
        reverse
        title="Down to the person"
        visual={
          <VisualMock bleed="left" frame="inset" name="revenue-profile" />
        }
      />
      <Pillar
        description="A payment is a fact your server knows. Revenue is accepted with the client secret, from your backend or your payment webhook. Browsers can send it only if you switch that on for the project."
        label="Server-side by default"
        points={[
          {
            title: 'Integers, in cents',
            text: 'op.revenue(2900) is $29.00. No floats, no strings, no rounding surprises.',
          },
          {
            title: 'Secret required unless you opt out',
            text: '"Allow unsafe revenue tracking" is off until you turn it on.',
          },
          {
            title: 'Checkout flows in the browser',
            text: 'pendingRevenue before the redirect, flushRevenue on the thank-you page.',
          },
        ]}
        title="Only from where you trust"
        visual={<VisualMock frame="inset" name="revenue-code" side="bottom" />}
      />
      <CardGrid
        items={[
          {
            title: 'A metric in any report',
            description:
              '"Sum of revenue" per day, by plan, by country, by campaign.',
            visual: <MiniRevenue />,
          },
          {
            title: 'In the sessions table',
            description:
              'A Revenue column, so the visits that paid are one sort away.',
            visual: <MiniSessionsRevenue />,
          },
          {
            title: 'On the project card',
            description:
              'Visitors, sessions and revenue for every project, before you open one.',
            visual: <MiniProjectCard />,
          },
          {
            title: 'On the event row',
            description: 'Revenue events show their amount in the events list.',
            visual: <MiniEventRows />,
          },
          {
            title: 'A message when someone pays',
            description:
              'A notification rule on the revenue event, to Slack, Discord or a webhook.',
            visual: <MiniSlackPayment />,
          },
          {
            title: 'Exported with everything else',
            description:
              'Revenue is a column on the event, so it is in every S3 or GCS export.',
            visual: <MiniExportFiles />,
          },
        ]}
        title="Where the money shows up"
      />
      <StepsBand
        description="No payment integration to set up. Send one event per charge from the webhook you already have."
        steps={[
          {
            title: 'Send the amount',
            text: 'From your backend with the client secret, or from the browser once you allow it.',
            visual: <CodeSnippet compact lines={SERVER_CODE} />,
          },
          {
            title: 'Or stage it through checkout',
            text: 'The web SDK keeps a pending amount until the thank-you page.',
            visual: <CodeSnippet compact lines={WEB_CODE} />,
          },
          {
            title: 'Read it everywhere',
            text: 'Overview, sessions, profiles, reports and exports. One currency, shown as USD.',
            visual: (
              <div className="rounded-xl bg-white p-3 ring-1 ring-black/6">
                <MiniRevenue />
              </div>
            ),
          },
        ]}
        title="How revenue gets in"
      />
      <FeatureClosing data={data} />
    </>
  );
}
