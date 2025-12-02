import { FaqItem, Faqs } from '@/components/faq';
import { Section, SectionHeader } from '@/components/section';
import Script from 'next/script';

const faqData = [
  {
    question: 'Does OpenPanel have a free tier?',
    answer:
      'For our Cloud plan we offer a 30 days free trial, this is mostly for you to be able to try out OpenPanel before committing to a paid plan. OpenPanel is also open-source and you can self-host it for free!\n\nWhy does OpenPanel not have a free tier? We want to make sure that OpenPanel is used by people who are serious about using it. We also need to invest time and resources to maintain the platform and provide support to our users.',
  },
  {
    question: 'Is everything really unlimited?',
    answer:
      'Yes! With OpenPanel, you get unlimited websites/apps, unlimited users, unlimited dashboards, unlimited charts, and unlimited tracked profiles.\n\nThe only limit is the number of events you track per month, which you choose based on your needs.',
  },
  {
    question: 'What is the difference between web and product analytics?',
    answer:
      'Web analytics focuses on website traffic, page views, and visitor behavior. Product analytics goes deeper, tracking user interactions, events, and product usage patterns.\n\nOpenPanel combines both, giving you a complete view of your users and product performance.',
  },
  {
    question: 'Do I need to modify my code to use OpenPanel?',
    answer:
      'OpenPanel offers multiple SDKs and integration options. For most frameworks, you can get started with just a few lines of code.\n\nWe provide SDKs for React, Next.js, Vue, Astro, and many more. Check our documentation for your specific framework.',
  },
  {
    question: 'Is my data GDPR compliant?',
    answer:
      "Yes! OpenPanel is designed with privacy in mind. We use cookie-less tracking, don't collect personal data without consent, and give you full control over your data.\n\nYou can self-host to ensure complete data sovereignty.",
  },
  {
    question: 'How does OpenPanel compare to other analytics tools?',
    answer:
      'We have a dedicated compare page where you can see how OpenPanel compares to other analytics tools. You can find it [here](/compare).',
  },
  {
    question: 'How does OpenPanel compare to Mixpanel?',
    answer:
      "OpenPanel offers similar powerful product analytics features as Mixpanel, but with the added benefits of being open-source, more affordable, and including web analytics capabilities.\n\nYou get Mixpanel's power with Plausible's simplicity.",
  },
  {
    question: 'How does OpenPanel compare to Plausible?',
    answer:
      "OpenPanel shares Plausible's privacy-first approach and simplicity, but adds powerful product analytics capabilities.\n\nWhile Plausible focuses on web analytics, OpenPanel combines both web and product analytics in one platform.",
  },
  {
    question: 'How does OpenPanel compare to Google Analytics?',
    answer:
      "OpenPanel is a privacy-first alternative to Google Analytics. Unlike GA, we don't use cookies, respect user privacy, and give you full control over your data.\n\nPlus, you get product analytics features that GA doesn't offer.",
  },
  {
    question: 'Can I export my data?',
    answer:
      'Absolutely! You own your data and can export it anytime. We have API endpoints to get all raw data that we have access to.\n\nIf you self-host, you have direct access and own all your data. For our cloud service, you can always reach out to us if you want a database dump of all your data—perfect if you want to move from cloud to self-hosting.\n\nWe have no lock-in whatsoever.',
  },
  {
    question: 'What kind of support do you offer?',
    answer:
      'We offer support through our documentation, GitHub issues, and Discord community. For paid plans, we provide email support.\n\nOur team is committed to helping you succeed with OpenPanel.',
  },
];

export function Faq() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map((q) => ({
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
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionHeader
          className="mb-16"
          title="FAQ"
          description="Some of the most common questions we get asked."
        />
        <Faqs>
          {faqData.map((faq) => (
            <FaqItem key={faq.question} question={faq.question}>
              {faq.answer}
            </FaqItem>
          ))}
        </Faqs>
      </div>
    </Section>
  );
}
