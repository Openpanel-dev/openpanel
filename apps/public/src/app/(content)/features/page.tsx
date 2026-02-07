import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { FeatureHero } from '@/app/(content)/features/[slug]/_components/feature-hero';
import { Section, SectionHeader } from '@/components/section';
import { WindowImage } from '@/components/window-image';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { featureSource } from '@/lib/source';
import type { Metadata } from 'next';
import { FeatureCardLink } from './_components/feature-card';

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
          srcDark="/screenshots/overview-dark.webp"
          srcLight="/screenshots/overview-light.webp"
          alt="OpenPanel Dashboard Overview"
          caption="Get a clear view of your product analytics with real-time insights and customizable dashboards."
        />
      </div>

      <Section className="container">
        <SectionHeader
          title="All features"
          description="Browse our capabilities. Each feature is designed to answer specific questions about your product and users."
          variant="sm"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {features.map((feature) => (
            <FeatureCardLink
              key={feature.slug}
              url={feature.url}
              title={feature.hero.heading}
              description={feature.hero.subheading}
            />
          ))}
        </div>
      </Section>

      <CtaBanner
        title="Ready to get started?"
        description="Join thousands of teams using OpenPanel for their analytics needs."
        ctaText="Get Started Free"
        ctaLink="/onboarding"
      />
    </div>
  );
}
