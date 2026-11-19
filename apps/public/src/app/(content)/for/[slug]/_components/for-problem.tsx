import { CardGrid } from '@/components/blocks/card-grid';
import type { ForProblem as ForProblemData } from '@/lib/for';

// What goes wrong with the usual tools for this audience. Text only.
export function ForProblem({ problem }: { problem: ForProblemData }) {
  return (
    <CardGrid
      columns={2}
      description={problem.intro}
      items={problem.items.map((item) => ({
        title: item.title,
        description: item.description,
      }))}
      label="The problem"
      title={problem.title}
    />
  );
}
