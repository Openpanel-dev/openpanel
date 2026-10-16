import { Section, SectionHeader } from '@/components/section';
import type { CompareUseCases } from '@/lib/compare';

interface UseCasesProps {
  useCases: CompareUseCases;
}

export function UseCases({ useCases }: UseCasesProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={useCases.intro}
        title={useCases.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {useCases.items.map((useCase) => (
          <div className="col gap-2 rounded-2xl border p-6" key={useCase.title}>
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
