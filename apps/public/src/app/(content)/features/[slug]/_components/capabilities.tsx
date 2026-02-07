import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { FeatureCapability } from '@/lib/features';
import { ZapIcon } from 'lucide-react';

interface CapabilitiesProps {
  title: string;
  intro?: string;
  capabilities: FeatureCapability[];
}

export function Capabilities({ title, intro, capabilities }: CapabilitiesProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={title}
        description={intro}
        variant="sm"
        className="mb-12"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {capabilities.map((cap) => (
          <FeatureCard
            key={cap.title}
            title={cap.title}
            description={cap.description}
            icon={ZapIcon}
          />
        ))}
      </div>
    </Section>
  );
}
