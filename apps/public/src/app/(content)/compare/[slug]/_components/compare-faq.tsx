import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import type { CompareFaqs } from '@/lib/compare';

interface CompareFaqProps {
  faqs: CompareFaqs;
}

export function CompareFaq({ faqs }: CompareFaqProps) {
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
