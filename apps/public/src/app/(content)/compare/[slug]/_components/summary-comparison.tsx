import { CheckIcon, XIcon } from 'lucide-react';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { CompareSummary } from '@/lib/compare';

interface SummaryComparisonProps {
  summary: CompareSummary;
  competitorName: string;
}

export function SummaryComparison({
  summary,
  competitorName,
}: SummaryComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        align="center"
        description={summary.one_liner}
        title="Quick comparison"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <FeatureCard
          className="border-green-500/20 bg-green-500/5"
          description=""
          title="Best for OpenPanel"
        >
          <ul className="col mt-4 gap-3">
            {summary.best_for_openpanel.map((item) => (
              <li className="row items-start gap-2 text-sm" key={item}>
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-green-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </FeatureCard>
        <FeatureCard
          className="border-muted"
          description=""
          title={`Best for ${competitorName}`}
        >
          <ul className="col mt-4 gap-3">
            {summary.best_for_competitor.map((item) => (
              <li className="row items-start gap-2 text-sm" key={item}>
                <XIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </FeatureCard>
      </div>
    </Section>
  );
}
