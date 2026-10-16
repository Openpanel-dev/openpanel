import {
  BellIcon,
  BrainIcon,
  HeartIcon,
  LayoutIcon,
  LockIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareFeatureComparison } from '@/lib/compare';

interface FeaturesShowcaseProps {
  featureComparison: CompareFeatureComparison;
}

const featureIcons = [
  HeartIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  LayoutIcon,
  BellIcon,
  BrainIcon,
  LockIcon,
];

export function FeaturesShowcase({ featureComparison }: FeaturesShowcaseProps) {
  // Get all features that OpenPanel has (true or string values)
  const openpanelFeatures = featureComparison.groups
    .flatMap((group) => group.features)
    .filter(
      (f) =>
        f.openpanel === true ||
        (typeof f.openpanel === 'string' && f.openpanel.toLowerCase() !== 'no')
    )
    .slice(0, 8);

  return (
    <Section className="container">
      <SectionHeader
        description={featureComparison.intro}
        title={featureComparison.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {openpanelFeatures.map((feature, index) => {
          const Icon = featureIcons[index] || SparklesIcon;
          return (
            <div className="col gap-3" key={feature.name}>
              <div className="center-center size-10 rounded-lg bg-primary/10">
                <Icon className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{feature.name}</h3>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
