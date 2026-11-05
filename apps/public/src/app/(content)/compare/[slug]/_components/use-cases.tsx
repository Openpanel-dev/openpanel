import { CardGrid } from '@/components/blocks/card-grid';
import type { CompareUseCases } from '@/lib/compare';

// Who OpenPanel fits better, as plain cards. The replicas live in the
// pillars above, so these stay text.
export function UseCases({ useCases }: { useCases: CompareUseCases }) {
  return (
    <CardGrid
      columns={useCases.items.length % 3 === 0 ? 3 : 2}
      description={useCases.intro}
      items={useCases.items.map((item) => ({
        title: item.title,
        description: item.description,
      }))}
      label="Who it fits"
      title={useCases.title}
    />
  );
}
