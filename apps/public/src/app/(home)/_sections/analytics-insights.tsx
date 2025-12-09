import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader, SectionLabel } from '@/components/section';
import {
  BarChart3Icon,
  DollarSignIcon,
  GlobeIcon,
  ZapIcon,
} from 'lucide-react';
import { ProductAnalyticsIllustration } from './illustrations/product-analytics';
import { WebAnalyticsIllustration } from './illustrations/web-analytics';

const features = [
  {
    title: 'Revenue tracking',
    description:
      'Track revenue from your payments and get insights into your revenue sources.',
    icon: DollarSignIcon,
  },
  {
    title: 'Profiles & Sessions',
    description:
      'Track individual users and their complete journey across your platform.',
    icon: GlobeIcon,
  },
  {
    title: 'Event Tracking',
    description:
      'Capture every important interaction with flexible event tracking.',
    icon: BarChart3Icon,
  },
];

export function AnalyticsInsights() {
  return (
    <Section className="container">
      <SectionHeader
        label="ANALYTICS & INSIGHTS"
        title="See the full picture of your users and product performance"
        description="Combine web and product analytics in one platform. Track visitors, events, revenue, and user journeys, all with privacy-first tracking."
        className="mb-16"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <FeatureCard
          variant="large"
          title="Web Analytics"
          description="Understand your website performance with privacy-first analytics and clear, actionable insights."
          illustration={<WebAnalyticsIllustration />}
          className="px-0 **:data-content:px-6"
        />
        <FeatureCard
          variant="large"
          title="Product Analytics"
          description="Turn raw data into clarity with real-time visualization of performance, behavior, and trends."
          illustration={<ProductAnalyticsIllustration />}
          className="px-0 **:data-content:px-6"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
          />
        ))}
      </div>
    </Section>
  );
}
