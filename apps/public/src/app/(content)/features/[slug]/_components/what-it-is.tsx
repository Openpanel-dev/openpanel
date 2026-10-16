import Markdown from 'react-markdown';
import { Section, SectionHeader } from '@/components/section';
import type { FeatureDefinition } from '@/lib/features';
import { cn } from '@/lib/utils';

interface WhatItIsProps {
  definition: FeatureDefinition;
  className?: string;
}

export function WhatItIs({ definition, className }: WhatItIsProps) {
  return (
    <Section className={cn('container', className)}>
      {definition.title && (
        <SectionHeader className="mb-8" title={definition.title} variant="sm" />
      )}
      <div className="prose prose-lg max-w-3xl text-muted-foreground [&_strong]:text-foreground">
        <Markdown>{definition.text}</Markdown>
      </div>
    </Section>
  );
}
