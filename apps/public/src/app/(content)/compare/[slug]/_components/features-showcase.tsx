import { Section, SectionHeader } from '@/components/section';
import { CompareFeatureComparison } from '@/lib/compare';
import {
  HeartIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  LayoutIcon,
  BellIcon,
  BrainIcon,
  LockIcon,
} from 'lucide-react';

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
        (typeof f.openpanel === 'string' && f.openpanel.toLowerCase() !== 'no'),
    )
    .slice(0, 8);

  return (
    <Section className="container">
      <SectionHeader
        title={featureComparison.title}
        description={featureComparison.intro}
        variant="sm"
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
        {openpanelFeatures.map((feature, index) => {
          const Icon = featureIcons[index] || SparklesIcon;
          return (
            <div key={feature.name} className="col gap-3">
              <div className="size-10 rounded-lg bg-primary/10 center-center">
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

