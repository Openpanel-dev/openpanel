import { CheckCircle2Icon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { ForFeatures as ForFeaturesData } from '@/lib/for';

interface ForFeaturesProps {
  features: ForFeaturesData;
}

export function ForFeatures({ features }: ForFeaturesProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={features.intro}
        title={features.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {features.items.map((feature) => (
          <div className="col gap-2 rounded-2xl border p-6" key={feature.title}>
            <div className="row items-center gap-2">
              <CheckCircle2Icon className="size-5 shrink-0 text-green-500" />
              <h3 className="font-semibold">{feature.title}</h3>
            </div>
            <p className="text-muted-foreground text-sm">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
