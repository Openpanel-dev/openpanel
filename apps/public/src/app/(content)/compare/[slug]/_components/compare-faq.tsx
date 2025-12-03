import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import { CompareFaqs } from '@/lib/compare';
import Script from 'next/script';
import { url } from '@/lib/layout.shared';

interface CompareFaqProps {
  faqs: CompareFaqs;
  pageUrl: string;
}

export function CompareFaq({ faqs, pageUrl }: CompareFaqProps) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };

  return (
    <Section className="container">
      <Script
        strategy="beforeInteractive"
        id="compare-faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionHeader
          className="mb-16"
          title={faqs.title}
          description={faqs.intro}
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

