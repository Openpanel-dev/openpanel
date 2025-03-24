'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';

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
    question: 'What happens if my site exceeds the limit?',
    answer: [
      "You will not see any new events in OpenPanel until your next billing period. If this happens 2 months in a row, we'll advice you to upgrade your plan.",
    ],
  },
  {
    question: 'What happens if I cancel my subscription?',
    answer: [
      'If you cancel your subscription, you will still have access to OpenPanel until the end of your current billing period. You can reactivate your subscription at any time.',
      'After your current billing period ends, you will not get access to new data.',
      "NOTE: If your account has been inactive for 3 months, we'll delete your events.",
    ],
  },
  {
    question: 'How do I change my billing information?',
    answer: [
      'You can change your billing information by clicking the "Manage your subscription" button in the billing section.',
    ],
  },
];

export function BillingFaq() {
  return (
    <Widget className="w-full">
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Usage</span>
      </WidgetHead>
      <Accordion
        type="single"
        collapsible
        className="w-full max-w-screen-md self-center"
      >
        {questions.map((q) => (
          <AccordionItem value={q.question} key={q.question}>
            <AccordionTrigger className="text-left px-4">
              {q.question}
            </AccordionTrigger>
            <AccordionContent>
              <div className="col gap-2 p-4 pt-2">
                {q.answer.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Widget>
  );
}
