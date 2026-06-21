import { CheckIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { ForBenefits as ForBenefitsData } from '@/lib/for';

interface ForBenefitsProps {
  benefits: ForBenefitsData;
}

export function ForBenefits({ benefits }: ForBenefitsProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={benefits.intro}
        title={benefits.title}
        variant="sm"
      />
      <div className="col mt-12 max-w-3xl gap-4">
        {benefits.items.map((benefit) => (
          <div className="row items-start gap-3" key={benefit.title}>
            <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-500" />
            <div className="col gap-1">
              <h3 className="font-semibold">{benefit.title}</h3>
              <p className="text-muted-foreground text-sm">
                {benefit.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
