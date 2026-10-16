import { CheckIcon, MinusIcon, XIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareHighlight } from '@/lib/compare';
import { cn } from '@/lib/utils';

interface HighlightsGridProps {
  highlights: CompareHighlight[];
}

function getIcon(value: string) {
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'yes' || lower.includes('✓')) {
    return <CheckIcon className="size-5 text-green-500" />;
  }
  if (lower === 'false' || lower === 'no' || lower.includes('✗')) {
    return <XIcon className="size-5 text-red-500" />;
  }
  return <MinusIcon className="size-5 text-muted-foreground" />;
}

export function HighlightsGrid({ highlights }: HighlightsGridProps) {
  return (
    <Section className="container">
      <SectionHeader
        align="center"
        description="See how OpenPanel compares at a glance"
        title="Key differences"
      />
      <div className="mt-12 overflow-hidden rounded-3xl border">
        <div className="divide-y divide-border">
          {highlights.map((highlight, index) => (
            <div
              className={cn(
                'grid gap-4 p-6 md:grid-cols-3',
                index % 2 === 0 ? 'bg-muted/30' : 'bg-background'
              )}
              key={highlight.label}
            >
              <div className="font-semibold text-sm md:text-base">
                {highlight.label}
              </div>
              <div className="row items-center gap-3">
                {getIcon(highlight.openpanel)}
                <span className="text-sm">{highlight.openpanel}</span>
              </div>
              <div className="row items-center gap-3 text-muted-foreground">
                {getIcon(highlight.competitor)}
                <span className="text-sm">{highlight.competitor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
