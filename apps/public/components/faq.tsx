import Script from 'next/script';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

export const Faqs = ({ children }: { children: React.ReactNode }) => (
  <Accordion
    type="single"
    collapsible
    className="w-full max-w-screen-md self-center border rounded-lg [&_button]:px-4 bg-background-dark [&_div.answer]:bg-background-light"
  >
    {children}
  </Accordion>
);

export const FaqItem = ({
  question,
  children,
}: { question: string; children: string }) => (
  <AccordionItem
    value={question}
    itemScope
    itemProp="mainEntity"
    itemType="https://schema.org/Question"
    className="[&_[role=region]]:px-4"
  >
    <AccordionTrigger className="text-left" itemProp="name">
      {question}
    </AccordionTrigger>
    <AccordionContent
      itemProp="acceptedAnswer"
      itemScope
      itemType="https://schema.org/Answer"
    >
      {children}
    </AccordionContent>
  </AccordionItem>
);
