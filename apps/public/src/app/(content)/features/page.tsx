import type { LucideIcon } from 'lucide-react';
import {
  BellIcon,
  ConeIcon,
  DollarSignIcon,
  FilterIcon,
  GlobeIcon,
  MonitorIcon,
  MousePointerClickIcon,
  PieChartIcon,
  RefreshCwIcon,
  ShareIcon,
  UserIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import { FeatureCardLink } from './_components/feature-card';
import { FeatureHero } from '@/app/(content)/features/[slug]/_components/feature-hero';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Section, SectionHeader } from '@/components/section';
import { WindowImage } from '@/components/window-image';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { featureSource } from '@/lib/source';

const featureIcons: Record<string, LucideIcon> = {
  conversion: FilterIcon,
  'data-visualization': PieChartIcon,
  'event-tracking': MousePointerClickIcon,
  funnels: ConeIcon,
  'identify-users': UserIcon,
  integrations: WorkflowIcon,
  notifications: BellIcon,
  retention: RefreshCwIcon,
  'revenue-tracking': DollarSignIcon,
  'session-tracking': MonitorIcon,
  'share-and-collaborate': ShareIcon,
  'web-analytics': GlobeIcon,
};

export const metadata: Metadata = getPageMetadata({
  title: 'Product analytics features',
  description:
    'Explore OpenPanel features: event tracking, funnels, retention, user profiles, and more. Privacy-first product analytics that just works.',
  url: url('/features'),
  image: getOgImageUrl('/features'),
});

const heroData = {
  heading: 'Product analytics features',
  subheading:
    'Everything you need to understand user behavior, conversion, and retention. Simple event-based analytics without the complexity.',
  badges: ['Privacy-first', 'No cookies required', 'Real-time data'],
};

export default async function FeaturesIndexPage() {
  const features = featureSource;

  return (
    <div>
      <FeatureHero hero={heroData} />

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Dashboard Overview"
          caption="Get a clear view of your product analytics with real-time insights and customizable dashboards."
          srcDark="/screenshots/overview-dark.webp"
          srcLight="/screenshots/overview-light.webp"
        />
      </div>

      <Section className="container">
        <SectionHeader
          description="Browse our capabilities. Each feature is designed to answer specific questions about your product and users."
          title="All features"
          variant="sm"
        />
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {features.map((feature) => (
            <FeatureCardLink
              description={feature.hero.subheading}
              icon={featureIcons[feature.slug]}
              key={feature.slug}
              title={feature.hero.heading}
              url={feature.url}
            />
          ))}
        </div>
      </Section>

      <CtaBanner
        ctaLink="https://dashboard.openpanel.dev/onboarding"
        ctaText="Get Started Free"
        description="Join thousands of teams using OpenPanel for their analytics needs."
        title="Ready to get started?"
      />
    </div>
  );
}
