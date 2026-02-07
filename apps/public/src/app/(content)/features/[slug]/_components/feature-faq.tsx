import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import type { FeatureFaqs } from '@/lib/features';
import Script from 'next/script';

interface FeatureFaqProps {
  faqs: FeatureFaqs;
}

export function FeatureFaq({ faqs }: FeatureFaqProps) {
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
        id="feature-faq-schema"
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
