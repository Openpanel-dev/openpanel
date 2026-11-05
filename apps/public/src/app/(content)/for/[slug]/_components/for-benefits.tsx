import { BenefitsBand } from '@/components/blocks/benefits-band';
import type { ForBenefits as ForBenefitsData } from '@/lib/for';

export function ForBenefits({ benefits }: { benefits: ForBenefitsData }) {
  return (
    <BenefitsBand
      description={benefits.intro}
      id="benefits"
      items={benefits.items}
      title={benefits.title}
    />
  );
}
