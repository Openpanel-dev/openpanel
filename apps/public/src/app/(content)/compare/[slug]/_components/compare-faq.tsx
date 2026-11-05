import { FaqSection } from '@/components/faq';
import type { CompareFaqs } from '@/lib/compare';

export function CompareFaq({ faqs }: { faqs: CompareFaqs }) {
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
