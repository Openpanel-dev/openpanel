import { Section, SectionHeader } from '@/components/section';
import { CompareSummary } from '@/lib/compare';
import { UsersIcon, TrendingUpIcon, PuzzleIcon, ShieldIcon } from 'lucide-react';

interface ProblemSectionProps {
  summary: CompareSummary;
  competitorName: string;
}

const problemIcons = [UsersIcon, TrendingUpIcon, PuzzleIcon, ShieldIcon];

export function ProblemSection({ summary, competitorName }: ProblemSectionProps) {
  const problems = summary.best_for_competitor.slice(0, 4);

  return (
    <Section className="container">
      <SectionHeader
        title={summary.title}
        description={summary.intro}
        variant="sm"
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
        {problems.map((problem, index) => {
          const Icon = problemIcons[index] || UsersIcon;
          return (
            <div key={problem} className="col gap-3 text-center">
              <div className="size-12 rounded-full bg-muted center-center mx-auto">
                <Icon className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{problem}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

