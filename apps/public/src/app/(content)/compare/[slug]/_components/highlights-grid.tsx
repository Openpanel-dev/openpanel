import { Section, SectionHeader } from '@/components/section';
import { CompareHighlight } from '@/lib/compare';
import { CheckIcon, XIcon, MinusIcon } from 'lucide-react';
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
        title="Key differences"
        description="See how OpenPanel compares at a glance"
        align="center"
      />
      <div className="mt-12 border rounded-3xl overflow-hidden">
        <div className="divide-y divide-border">
          {highlights.map((highlight, index) => (
            <div
              key={highlight.label}
              className={cn(
                'grid md:grid-cols-3 gap-4 p-6',
                index % 2 === 0 ? 'bg-muted/30' : 'bg-background'
              )}
            >
              <div className="font-semibold text-sm md:text-base">
                {highlight.label}
              </div>
              <div className="row gap-3 items-center">
                {getIcon(highlight.openpanel)}
                <span className="text-sm">{highlight.openpanel}</span>
              </div>
              <div className="row gap-3 items-center text-muted-foreground">
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

