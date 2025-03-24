import { ShieldQuestionIcon } from 'lucide-react';
import Script from 'next/script';
import { Section, SectionHeader } from '../section';
import { Tag } from '../tag';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';

const questions = [
  {
    question: 'Does OpenPanel have a free tier?',
    answer: [
      'For our Cloud plan we offer a 14 days free trial, this is mostly for you to be able to try out OpenPanel before committing to a paid plan.',
      'OpenPanel is also open-source and you can self-host it for free!',
      '',
      'Why does OpenPanel not have a free tier?',
      'We want to make sure that OpenPanel is used by people who are serious about using it. We also need to invest time and resources to maintain the platform and provide support to our users.',
    ],
  },
  {
    question: 'Is everything really unlimited?',
    answer: [
      'Everything except the amount of events is unlimited.',
      'We do not limit the amount of users, projects, dashboards, etc. We want a transparent and fair pricing model and we think unlimited is the best way to do this.',
    ],
  },
  {
    question: 'What is the difference between web and product analytics?',
    answer: [
      'Web analytics focuses on website traffic metrics like page views, bounce rates, and visitor sources. Product analytics goes deeper into user behavior, tracking specific actions, user journeys, and feature usage within your application.',
    ],
  },
  {
    question: 'Do I need to modify my code to use OpenPanel?',
    answer: [
      'Minimal setup is required. Simply add our lightweight JavaScript snippet to your website or use one of our SDKs for your preferred framework. Most common frameworks like React, Vue, and Next.js are supported.',
    ],
  },
  {
    question: 'Is my data GDPR compliant?',
    answer: [
      'Yes, OpenPanel is fully GDPR compliant. We collect only essential data, do not use cookies for tracking, and provide tools to help you maintain compliance with privacy regulations.',
      'You can self-host OpenPanel to keep full control of your data.',
    ],
  },
  {
    question: 'How does OpenPanel compare to Mixpanel?',
    answer: [
      'OpenPanel offers most of Mixpanel report features such as funnels, retention and visualizations of your data. If you miss something, please let us know. The biggest difference is that OpenPanel offers better web analytics.',
      'Other than that OpenPanel is way cheaper and can also be self-hosted.',
    ],
  },
  {
    question: 'How does OpenPanel compare to Plausible?',
    answer: [
      `OpenPanel's web analytics is inspired by Plausible like many other analytics tools. The difference is that OpenPanel offers more tools for product analytics and better support for none web devices (iOS,Android and servers).`,
    ],
  },
  {
    question: 'How does OpenPanel compare to Google Analytics?',
    answer: [
      'OpenPanel offers a more privacy-focused, user-friendly alternative to Google Analytics. We provide real-time data, no sampling, and more intuitive product analytics features.',
      'Unlike GA4, our interface is designed to be simple yet powerful, making it easier to find the insights you need.',
    ],
  },
  {
    question: 'Can I export my data?',
    answer: [
      'Currently you can export your data with our API. Depending on how many events you have this can be an issue.',
      'We are working on better export options and will be finished around Q1 2025.',
    ],
  },
  {
    question: 'What kind of support do you offer?',
    answer: ['Currently we offer support through GitHub and Discord.'],
  },
];

export default Faq;
export function Faq() {
  // Create the JSON-LD structured data
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer.join(' '),
      },
    })),
  };

  return (
    <Section className="container">
      {/* Add the JSON-LD script */}
      <Script
        strategy="beforeInteractive"
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <SectionHeader
        tag={
          <Tag>
            <ShieldQuestionIcon className="size-4" strokeWidth={1.5} />
            Get answers today
          </Tag>
        }
        title="FAQ"
        description="Some of the most common questions we get asked."
      />

      <Accordion
        type="single"
        collapsible
        className="w-full max-w-screen-md self-center"
      >
        {questions.map((q) => (
          <AccordionItem value={q.question} key={q.question}>
            <AccordionTrigger className="text-left">
              {q.question}
            </AccordionTrigger>
            <AccordionContent>
              <div className="max-w-2xl col gap-2">
                {q.answer.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
