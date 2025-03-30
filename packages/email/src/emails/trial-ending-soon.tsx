import { Button, Hr, Link, Text } from '@react-email/components';
import React from 'react';
import { z } from 'zod';
import { Layout } from '../components/layout';

export const zTrailEndingSoon = z.object({
  url: z.string(),
  organizationName: z.string(),
});

export type Props = z.infer<typeof zTrailEndingSoon>;
export default TrailEndingSoon;
export function TrailEndingSoon({
  organizationName = 'Acme Co',
  url = 'https://openpanel.dev',
}: Props) {
  const newUrl = new URL(url);
  newUrl.searchParams.set('utm_source', 'email');
  newUrl.searchParams.set('utm_medium', 'email');
  newUrl.searchParams.set('utm_campaign', 'trial-ending-soon');
  return (
    <Layout>
      <Text>Your trial period is ending soon for {organizationName}!</Text>
      <Text>
        When your trial ends, you'll still receive incoming events but you won't
        be able to see them in the dashboard until you upgrade.
      </Text>
      <Text>
        <Link href={newUrl.toString()}>Upgrade to a paid plan</Link>
      </Text>
      <Hr />
      <Text style={{ fontWeight: 'bold' }}>
        Discover what you can do with OpenPanel:
      </Text>
      <Text>
        🎯 <strong>Create Custom Funnels</strong> - Track user progression
        through your key conversion paths and identify where users drop off
      </Text>
      <Text>
        📈 <strong>User Retention Analysis</strong> - Understand how well you're
        keeping users engaged over time with beautiful retention graphs
      </Text>
      <Text>
        🗺️ <strong>User Journey Mapping</strong> - Follow individual user paths
        through your application to understand their behavior and optimize their
        experience
      </Text>
      <Text>
        🔬 <strong>A/B Testing Analysis</strong> - Measure the impact of your
        product changes with detailed conversion metrics and statistical
        significance
      </Text>
      <Text>
        📊 <strong>Custom Event Tracking</strong> - Track any user interaction
        that matters to your business with our flexible event system
      </Text>
      <Text>
        <Button
          href={newUrl.toString()}
          style={{
            backgroundColor: '#0070f3',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '5px',
            textDecoration: 'none',
          }}
        >
          Upgrade Now to Unlock All Features
        </Button>
      </Text>
    </Layout>
  );
}
