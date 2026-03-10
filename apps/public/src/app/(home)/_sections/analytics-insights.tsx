import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { NotificationsIllustration } from '@/components/illustrations/notifications';
import { ProductAnalyticsIllustration } from '@/components/illustrations/product-analytics';
import { RetentionIllustration } from '@/components/illustrations/retention';
import { SessionReplayIllustration } from '@/components/illustrations/session-replay';
import { WebAnalyticsIllustration } from '@/components/illustrations/web-analytics';
import { Section, SectionHeader } from '@/components/section';

function wrap(child: React.ReactNode) {
  return <div className="h-48 overflow-hidden">{child}</div>;
}

const mediumFeatures = [
  {
    title: 'Retention',
    description:
      'Know how many users come back after day 1, day 7, day 30. Identify which behaviors predict long-term retention.',
    illustration: wrap(<RetentionIllustration />),
    link: { href: '/features/retention', children: 'View retention' },
  },
  {
    title: 'Session Replay',
    description:
      'Watch real user sessions to see exactly what happened — clicks, scrolls, rage clicks. Privacy controls built in.',
    illustration: wrap(<SessionReplayIllustration />),
    link: { href: '/features/session-replay', children: 'See session replay' },
  },
  {
    title: 'Notifications',
    description:
      'Get notified when a funnel is completed. Stay on top of key moments in your product without watching dashboards all day.',
    illustration: wrap(<NotificationsIllustration />),
    link: { href: '/features/notifications', children: 'Set up notifications' },
  },
];

export function AnalyticsInsights() {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description="From first page view to long-term retention — every touchpoint in one platform. No sampling, no data limits, no guesswork."
        label="ANALYTICS & INSIGHTS"
        title="Everything you need to understand your users"
      />

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description="Understand your website performance with privacy-first analytics. Track visitors, referrers, and page views without touching user cookies."
          illustration={<WebAnalyticsIllustration />}
          title="Web Analytics"
        />
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description="Go beyond page views. Track custom events, understand user flows, and explore exactly how people use your product."
          illustration={<ProductAnalyticsIllustration />}
          title="Product Analytics"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {mediumFeatures.map((feature) => (
          <FeatureCard
            className="px-0 pt-0 **:data-content:px-6"
            description={feature.description}
            illustration={feature.illustration}
            key={feature.title}
            link={feature.link}
            title={feature.title}
          />
        ))}
      </div>

      <p className="mt-8 text-center">
        <Link
          className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/features"
        >
          Explore all features
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </p>
    </Section>
  );
}
