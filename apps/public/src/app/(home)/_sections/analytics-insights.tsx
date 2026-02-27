import {
  BarChart3Icon,
  ChevronRightIcon,
  DollarSignIcon,
  GlobeIcon,
  PlayCircleIcon,
} from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { ProductAnalyticsIllustration } from '@/components/illustrations/product-analytics';
import { WebAnalyticsIllustration } from '@/components/illustrations/web-analytics';
import { Section, SectionHeader } from '@/components/section';

const features = [
  {
    title: 'Revenue tracking',
    description:
      'Track revenue from your payments and get insights into your revenue sources.',
    icon: DollarSignIcon,
    link: {
      href: '/features/revenue-tracking',
      children: 'More about revenue',
    },
  },
  {
    title: 'Profiles & Sessions',
    description:
      'Track individual users and their complete journey across your platform.',
    icon: GlobeIcon,
    link: {
      href: '/features/identify-users',
      children: 'Identify your users',
    },
  },
  {
    title: 'Event Tracking',
    description:
      'Capture every important interaction with flexible event tracking.',
    icon: BarChart3Icon,
    link: {
      href: '/features/event-tracking',
      children: 'All about tracking',
    },
  },
  {
    title: 'Session Replay',
    description:
      'Watch real user sessions to see exactly what happened. Privacy controls built in, loads async.',
    icon: PlayCircleIcon,
    link: {
      href: '/features/session-replay',
      children: 'See session replay',
    },
  },
];

export function AnalyticsInsights() {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description="Combine web and product analytics in one platform. Track visitors, events, revenue, and user journeys, all with privacy-first tracking."
        label="ANALYTICS & INSIGHTS"
        title="See the full picture of your users and product performance"
      />
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description="Understand your website performance with privacy-first analytics and clear, actionable insights."
          illustration={<WebAnalyticsIllustration />}
          title="Web Analytics"
          variant="large"
        />
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description="Turn raw data into clarity with real-time visualization of performance, behavior, and trends."
          illustration={<ProductAnalyticsIllustration />}
          title="Product Analytics"
          variant="large"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <FeatureCard
            description={feature.description}
            icon={feature.icon}
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
