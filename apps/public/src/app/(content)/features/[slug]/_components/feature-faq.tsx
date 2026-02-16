import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import type { FeatureFaqs } from '@/lib/features';

interface FeatureFaqProps {
  faqs: FeatureFaqs;
}

export function FeatureFaq({ faqs }: FeatureFaqProps) {
  return (
    <Section className="container">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionHeader
          className="mb-16"
          description={faqs.intro}
          title={faqs.title}
          variant="sm"
        />
        <Faqs>
          {faqs.items.map((faq) => (
            <FaqItem key={faq.question} question={faq.question}>
              {faq.answer}
            </FaqItem>
          ))}
        </Faqs>
      </div>
    </Section>
  );
}
