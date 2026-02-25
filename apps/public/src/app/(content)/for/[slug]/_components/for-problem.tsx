import { XCircleIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { ForProblem as ForProblemData } from '@/lib/for';

interface ForProblemProps {
  problem: ForProblemData;
}

export function ForProblem({ problem }: ForProblemProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={problem.intro}
        title={problem.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {problem.items.map((item) => (
          <div className="col gap-2 rounded-2xl border p-6" key={item.title}>
            <div className="row items-center gap-2">
              <XCircleIcon className="size-5 shrink-0 text-red-500" />
              <h3 className="font-semibold">{item.title}</h3>
            </div>
            <p className="text-muted-foreground text-sm">{item.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
