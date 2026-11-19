import { FaqSection } from '@/components/faq';
import type { ForFaqs } from '@/lib/for';

export function ForFaq({ faqs }: { faqs: ForFaqs }) {
  return (
    <div id="faq">
      <FaqSection
        description={faqs.intro}
        items={faqs.items}
        title={faqs.title}
      />
    </div>
  );
}
