import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { CompareSummary } from '@/lib/compare';
import { CheckIcon, XIcon } from 'lucide-react';

interface SummaryComparisonProps {
  summary: CompareSummary;
  competitorName: string;
}

export function SummaryComparison({ summary, competitorName }: SummaryComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        title="Quick comparison"
        description={summary.one_liner}
        align="center"
      />
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <FeatureCard
          title="Best for OpenPanel"
          description=""
          className="border-green-500/20 bg-green-500/5"
        >
          <ul className="col gap-3 mt-4">
            {summary.best_for_openpanel.map((item) => (
              <li key={item} className="row gap-2 items-start text-sm">
                <CheckIcon className="size-4 shrink-0 mt-0.5 text-green-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </FeatureCard>
        <FeatureCard
          title={`Best for ${competitorName}`}
          description=""
          className="border-muted"
        >
          <ul className="col gap-3 mt-4">
            {summary.best_for_competitor.map((item) => (
              <li key={item} className="row gap-2 items-start text-sm">
                <XIcon className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </FeatureCard>
      </div>
    </Section>
  );
}

