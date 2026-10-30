import { FaqItem, Faqs } from '@/components/faq';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';

const faqData = [
  {
    question: 'Does OpenPanel have a free tier?',
    answer:
      'The cloud plan comes with a 30-day free trial so you can try everything before paying. OpenPanel is also open source, so you can self-host it for free, forever.',
  },
  {
    question: 'Is everything really unlimited?',
    answer:
      'Yes. Unlimited websites and apps, unlimited team members, unlimited dashboards, charts and tracked profiles. The only thing you pay for is the number of events per month.',
  },
  {
    question: 'What is the difference between web and product analytics?',
    answer:
      'Web analytics is about traffic: visitors, referrers, pages. Product analytics is about behaviour: which events people trigger, where they drop off, who comes back. OpenPanel does both in one place.',
  },
  {
    question: 'What does AI observability track?',
    answer:
      'Every model call your product makes: cost, input and output tokens, latency, errors and the model used, linked to the user and session it belongs to. Send events with the Vercel AI SDK middleware or the API.',
  },
  {
    question: 'Is OpenPanel a good Mixpanel alternative?',
    answer:
      'Yes. OpenPanel covers the core of what most teams use in Mixpanel: event tracking, funnels, retention, cohorts and user profiles. It starts at $2.50 a month, can be self-hosted for free, and is cookie-free with EU hosting. See the [OpenPanel vs Mixpanel comparison](/compare/mixpanel-alternative).',
  },
  {
    question: 'Is my data GDPR compliant?',
    answer:
      'OpenPanel uses cookie-less tracking, stores cloud data in the EU and gives you full control over your data. Self-host if you want complete data sovereignty.',
  },
  {
    question: 'Can I export my data?',
    answer:
      'Yes. The API exposes all raw data, and self-hosters have direct database access. If you are on the cloud and want to move, ask us for a database dump. There is no lock-in.',
  },
  {
    question: 'How does OpenPanel compare to other tools?',
    answer:
      'See the [compare pages](/compare), or read our guide to the [best open source web analytics tools](/articles/self-hosted-web-analytics).',
  },
];

export function Faq() {
  return (
    <Section className="container">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_1.4fr] md:gap-16">
        <div className="col gap-8">
          <SectionHeader
            description="The questions we get most often."
            title="FAQ"
            variant="sm"
          />
          <GetStartedButton className="w-fit max-md:hidden" />
        </div>
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
