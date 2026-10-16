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
        className="mb-12"
        description={data.intro}
        title={data.title}
        variant="sm"
      />
      <div className="relative">
        {data.steps.map((step, index) => (
          <div
            className="relative mb-8 flex min-w-0 gap-4 last:mb-0"
            key={step.title}
          >
            <div className="flex shrink-0 flex-col items-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm shadow-sm">
                {index + 1}
              </div>
              {index < data.steps.length - 1 && (
                <div className="mt-2 min-h-[2rem] w-0.5 flex-1 bg-border" />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1 pb-8">
              <h3 className="mb-1 font-semibold text-foreground">
                {step.title}
              </h3>
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
