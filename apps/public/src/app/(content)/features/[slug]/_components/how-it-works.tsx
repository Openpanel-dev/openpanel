import { Section, SectionHeader } from '@/components/section';
import type { FeatureHowItWorks } from '@/lib/features';
import { cn } from '@/lib/utils';

interface HowItWorksProps {
  data: FeatureHowItWorks;
}

export function HowItWorks({ data }: HowItWorksProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={data.title}
        description={data.intro}
        variant="sm"
        className="mb-12"
      />
      <div className="relative">
        {data.steps.map((step, index) => (
          <div
            key={step.title}
            className="relative flex gap-4 mb-8 last:mb-0 min-w-0"
          >
            <div className="flex flex-col items-center shrink-0">
              <div className="flex items-center justify-center size-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-sm">
                {index + 1}
              </div>
              {index < data.steps.length - 1 && (
                <div className="w-0.5 bg-border mt-2 flex-1 min-h-[2rem]" />
              )}
            </div>
            <div className="flex-1 pt-1 min-w-0 pb-8">
              <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
              <p className={cn('text-muted-foreground text-sm')}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
