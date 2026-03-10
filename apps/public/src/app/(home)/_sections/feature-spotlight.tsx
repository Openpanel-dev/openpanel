import { FeatureCard } from '@/components/feature-card';
import { ConversionsIllustration } from '@/components/illustrations/conversions';
import { GoogleSearchConsoleIllustration } from '@/components/illustrations/google-search-console';
import { RevenueIllustration } from '@/components/illustrations/revenue';
import { Section, SectionHeader } from '@/components/section';

function wrap(child: React.ReactNode) {
  return <div className="h-48 overflow-hidden">{child}</div>;
}

const features = [
  {
    title: 'Revenue Tracking',
    description:
      'Connect payment events to track MRR and see which referrers drive the most revenue.',
    illustration: wrap(<RevenueIllustration />),
    link: {
      href: '/features/revenue-tracking',
      children: 'Track revenue',
    },
  },
  {
    title: 'Conversion Tracking',
    description:
      'Monitor conversion rates over time and break down by A/B variant, country, or device. Catch regressions before they cost you.',
    illustration: wrap(<ConversionsIllustration />),
    link: {
      href: '/features/conversion',
      children: 'Track conversions',
    },
  },
  {
    title: 'Google Search Console',
    description:
      'See which search queries bring organic traffic and how visitors convert after landing. Your SEO and product data, in one place.',
    illustration: wrap(<GoogleSearchConsoleIllustration />),
    link: {
      href: '/features/integrations',
      children: 'View integrations',
    },
  },
];

export function FeatureSpotlight() {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description="OpenPanel goes beyond page views. Track revenue, monitor conversions, and connect your SEO data — all without switching tools."
        label="GROWTH TOOLS"
        title="Built for teams who ship and measure"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((feature) => (
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
    </Section>
  );
}
