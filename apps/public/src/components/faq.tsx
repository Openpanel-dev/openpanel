import Markdown from 'react-markdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

export const Faqs = ({
  children,
  schema = false,
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
      className="w-full divide-y divide-neutral-200 border-neutral-200 border-y [&_[role=region]]:pb-2 [&_button]:py-5 [&_button]:text-base"
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
    className="border-0"
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
