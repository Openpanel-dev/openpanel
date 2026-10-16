import { ZapIcon } from 'lucide-react';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { FeatureCapability } from '@/lib/features';

interface CapabilitiesProps {
  title: string;
  intro?: string;
  capabilities: FeatureCapability[];
}

export function Capabilities({
  title,
  intro,
  capabilities,
}: CapabilitiesProps) {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-12"
        description={intro}
        title={title}
        variant="sm"
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((cap) => (
          <FeatureCard
            description={cap.description}
            icon={ZapIcon}
            key={cap.title}
            title={cap.title}
          />
        ))}
      </div>
    </Section>
  );
}
