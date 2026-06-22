import { Heading, Hr, Link, Section, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';
import { List } from '../components/list';
import { withUtm } from '../utm';

export const zWeeklyDigest = z.object({
  projectName: z.string(),
  dashboardUrl: z.string(),
  dateRange: z.string(),
  narrative: z.string().optional(),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      delta: z.string().optional(),
      direction: z.enum(['up', 'down', 'flat']).optional(),
    }),
  ),
  insights: z.array(
    z.object({
      title: z.string(),
      summary: z.string().optional(),
    }),
  ),
});

export type Props = z.infer<typeof zWeeklyDigest>;
export default WeeklyDigest;

function deltaColor(direction?: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return '#16a34a';
  if (direction === 'down') return '#dc2626';
  return '#6b7280';
}

export function WeeklyDigest({
  projectName,
  dashboardUrl = 'https://dashboard.openpanel.dev',
  dateRange,
  narrative,
  stats,
  insights,
  unsubscribeUrl,
}: Props & { unsubscribeUrl?: string }) {
  return (
    <Layout unsubscribeUrl={unsubscribeUrl}>
      <Heading as="h2" className="text-xl font-semibold">
        Your week on {projectName}
      </Heading>
      <Text className="text-sm text-gray-500">{dateRange}</Text>

      {narrative && <Text>{narrative}</Text>}

      {stats.length > 0 && (
        <Section className="my-4">
          {stats.map((s) => (
            <Text key={s.label} className="my-1">
              <strong>{s.value}</strong> {s.label}
              {s.delta && (
                <span style={{ color: deltaColor(s.direction) }}>
                  {' '}
                  ({s.delta})
                </span>
              )}
            </Text>
          ))}
        </Section>
      )}

      {insights.length > 0 && (
        <>
          <Hr />
          <Heading as="h3" className="text-base font-semibold">
            What stood out
          </Heading>
          <List
            items={insights.map((i) => (
              <span key={i.title}>
                <strong>{i.title}</strong>
                {i.summary ? ` — ${i.summary}` : ''}
              </span>
            ))}
          />
        </>
      )}

      <Section className="mt-6">
        <Link href={withUtm(dashboardUrl, 'weekly-digest')}>
          Open your dashboard →
        </Link>
      </Section>
    </Layout>
  );
}

WeeklyDigest.PreviewProps = {
  projectName: 'Public Web 2',
  dashboardUrl: 'http://localhost:3000/openpanel-dev/public-web',
  dateRange: 'Jun 8 – Jun 15, 2026',
  narrative:
    "This week on Public Web 2, overall visitor numbers remained steady with a slight dip from 3,898 to 3,889, while sessions saw a modest increase to 4,777. Notably, visits originating from Twitter nearly tripled over the past month, boosting social media engagement considerably. Additionally, user interest in the IP lookup tool has more than doubled, and activity on the dashboard's settings page surged by over 200%, reflecting stronger interaction with site features. However, traffic from Ukraine fell sharply by over 80%, a drop that likely impacted overall traffic and may warrant further attention.",
  stats: [
    { label: 'visitors', value: '3 889', delta: '-0%', direction: 'flat' },
    { label: 'sessions', value: '4 777', delta: '+2%', direction: 'up' },
    { label: 'pageviews', value: '25 254', delta: '-2%', direction: 'down' },
    { label: 'bounce rate', value: '49%', delta: '+0pp', direction: 'flat' },
  ],
  insights: [
    {
      title:
        'Visits from Twitter nearly tripled over the last 30 days, a major surge indicating increased social media engagement.',
      summary: 'Last 30 days. Sessions 277 vs 99.',
    },
    {
      title:
        'Visits starting at the IP lookup tool on openpanel.dev more than doubled in the past 30 days, a strong sign of increased user interest in this feature.',
      summary: 'Last 30 days. Sessions 1168 vs 520.',
    },
    {
      title:
        'Settings page on the dashboard experienced a strong surge with 211.5% more sessions, indicating increased user activity or interest.',
      summary: 'Last 30 days. Sessions 81 vs 26.',
    },
    {
      title:
        'Visits from Ukraine fell steeply by over 80% in the last week, a major drop that likely affects overall site traffic and should be investigated.',
      summary: 'Last 7 days. Traffic change from Ukraine.',
    },
    {
      title:
        'Traffic from New Zealand surged by 170% in the last 30 days, a large jump suggesting significant new interest from this market.',
      summary: 'Last 30 days. Traffic change from New Zealand.',
    },
  ],
} satisfies Props;
