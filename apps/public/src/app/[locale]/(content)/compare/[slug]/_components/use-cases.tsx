import { Section, SectionHeader } from '@/components/section';
import { CompareUseCases } from '@/lib/compare';

interface UseCasesProps {
  useCases: CompareUseCases;
}

export function UseCases({ useCases }: UseCasesProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={useCases.title}
        description={useCases.intro}
        variant="sm"
      />
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        {useCases.items.map((useCase) => (
          <div key={useCase.title} className="col gap-2 p-6 border rounded-2xl">
            <h3 className="font-semibold">{useCase.title}</h3>
            <p className="text-sm text-muted-foreground">{useCase.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
