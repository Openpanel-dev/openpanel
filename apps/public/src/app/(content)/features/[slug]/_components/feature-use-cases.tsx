import { Section, SectionHeader } from '@/components/section';
import type { FeatureUseCases } from '@/lib/features';

interface FeatureUseCasesProps {
  useCases: FeatureUseCases;
}

export function FeatureUseCasesSection({ useCases }: FeatureUseCasesProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={useCases.title}
        description={useCases.intro}
        variant="sm"
        className="mb-12"
      />
      <div className="grid md:grid-cols-2 gap-6">
        {useCases.items.map((useCase) => (
          <div
            key={useCase.title}
            className="col gap-2 p-6 border rounded-2xl bg-card/50"
          >
            <h3 className="font-semibold">{useCase.title}</h3>
            <p className="text-sm text-muted-foreground">{useCase.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
