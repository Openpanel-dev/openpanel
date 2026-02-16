import Markdown from 'react-markdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

export const Faqs = ({
  children,
  schema = true,
}: {
  children: React.ReactNode;
  schema?: boolean;
}) => (
  <div
    {...(schema
      ? { itemScope: true, itemType: 'https://schema.org/FAQPage' }
      : {})}
  >
    <Accordion
      className="w-full max-w-screen-md self-center rounded-3xl border bg-background-dark [&_button]:px-4 [&_div.answer]:bg-background-light"
      collapsible
      type="single"
    >
      {children}
    </Accordion>
  </div>
);

export const FaqItem = ({
  question,
  children,
}: {
  question: string;
  children: string | React.ReactNode;
}) => (
  <AccordionItem
    className="[&_[role=region]]:px-4"
    itemProp="mainEntity"
    itemScope
    itemType="https://schema.org/Question"
    value={question}
  >
    <AccordionTrigger className="text-left" itemProp="name">
      {question}
    </AccordionTrigger>
    <AccordionContent
      className="prose"
      itemProp="acceptedAnswer"
      itemScope
      itemType="https://schema.org/Answer"
    >
      <div itemProp="text">
        {typeof children === 'string' ? (
          <Markdown>{children}</Markdown>
        ) : (
          children
        )}
      </div>
    </AccordionContent>
  </AccordionItem>
);
