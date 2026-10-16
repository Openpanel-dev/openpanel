import {
  PuzzleIcon,
  ShieldIcon,
  TrendingUpIcon,
  UsersIcon,
} from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareSummary } from '@/lib/compare';

interface ProblemSectionProps {
  summary: CompareSummary;
  competitorName: string;
}

const problemIcons = [UsersIcon, TrendingUpIcon, PuzzleIcon, ShieldIcon];

export function ProblemSection({
  summary,
  competitorName,
}: ProblemSectionProps) {
  const problems = summary.best_for_competitor.slice(0, 4);

  return (
    <Section className="container">
      <SectionHeader
        description={summary.intro}
        title={summary.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {problems.map((problem, index) => {
          const Icon = problemIcons[index] || UsersIcon;
          return (
            <div className="col gap-3 text-center" key={problem}>
              <div className="center-center mx-auto size-12 rounded-full bg-muted">
                <Icon className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">{problem}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
