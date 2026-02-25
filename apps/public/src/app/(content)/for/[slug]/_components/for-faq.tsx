import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import type { ForFaqs } from '@/lib/for';

interface ForFaqProps {
  faqs: ForFaqs;
}

export function ForFaq({ faqs }: ForFaqProps) {
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
