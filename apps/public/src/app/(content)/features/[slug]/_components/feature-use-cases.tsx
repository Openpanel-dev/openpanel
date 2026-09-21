import { Section, SectionHeader } from '@/components/section';
import type { FeatureUseCases } from '@/lib/features';

interface FeatureUseCasesProps {
  useCases: FeatureUseCases;
}

export function FeatureUseCasesSection({ useCases }: FeatureUseCasesProps) {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-12"
        description={useCases.intro}
        title={useCases.title}
        variant="sm"
      />
      <div className="grid gap-6 md:grid-cols-2">
        {useCases.items.map((useCase) => (
          <div
            className="col gap-2 rounded-2xl border bg-card/50 p-6"
            key={useCase.title}
          >
            <h3 className="font-semibold">{useCase.title}</h3>
            <p className="text-muted-foreground text-sm">
              {useCase.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
