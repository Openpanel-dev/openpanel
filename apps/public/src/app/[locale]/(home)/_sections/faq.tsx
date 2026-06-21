import { FaqItem, Faqs } from '@/components/faq';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { getTranslations } from 'next-intl/server';

export async function Faq() {
  const t = await getTranslations('home');
  const items = Array.from({ length: 11 }, (_, index) => {
    const n = index + 1;
    return {
      question: t(`faq_${n}_question`),
      answer: t(`faq_${n}_answer`),
    };
  });

  return (
    <Section className="container">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col gap-8">
          <SectionHeader description={t('faq_description')} title={t('faq_title')} />
          <GetStartedButton className="w-fit max-md:hidden" />
        </div>
        <Faqs>
          {items.map(({ question, answer }) => (
            <FaqItem key={question} question={question}>
              {answer}
            </FaqItem>
          ))}
        </Faqs>
      </div>
    </Section>
  );
}
