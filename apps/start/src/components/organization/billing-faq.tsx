import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Widget, WidgetHead } from '@/components/widget';
import { useTranslation } from 'react-i18next';

export function BillingFaq() {
  const { t } = useTranslation();
  const questions = [
    {
      question: t('billing.faq_free_tier_question'),
      answer: [
        t('billing.faq_free_tier_answer_trial'),
        t('billing.faq_free_tier_answer_self_host'),
        '',
        t('billing.faq_free_tier_answer_why_title'),
        t('billing.faq_free_tier_answer_why_body'),
      ],
    },
    {
      question: t('billing.faq_exceeds_limit_question'),
      answer: [t('billing.faq_exceeds_limit_answer')],
    },
    {
      question: t('billing.faq_cancel_subscription_question'),
      answer: [
        t('billing.faq_cancel_subscription_answer_access'),
        t('billing.faq_cancel_subscription_answer_data'),
        t('billing.faq_cancel_subscription_answer_note'),
      ],
    },
    {
      question: t('billing.faq_billing_information_question'),
      answer: [t('billing.faq_billing_information_answer')],
    },
    {
      question: t('billing.faq_custom_plan_question'),
      answer: [t('billing.faq_custom_plan_answer')],
    },
  ];

  return (
    <Widget className="w-full">
      <WidgetHead className="flex items-center justify-between">
        <span className="title">{t('billing.faq_title')}</span>
      </WidgetHead>
      <Accordion
        className="w-full max-w-screen-md self-center"
        collapsible
        type="single"
      >
        {questions.map((q) => (
          <AccordionItem key={q.question} value={q.question}>
            <AccordionTrigger className="px-4 text-left">
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
