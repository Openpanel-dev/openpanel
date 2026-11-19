import { ColumnHeads, STACKED_TABLE } from './scoreboard';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareTechnicalComparison } from '@/lib/compare';
import { cn } from '@/lib/utils';

function Value({ value }: { value: string | string[] }) {
  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <li
            className="rounded-md bg-white px-2 py-0.5 text-xs ring-1 ring-black/6"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }
  return <span>{value}</span>;
}

export function TechnicalComparison({
  technical,
  competitorName,
  competitorSlug,
}: {
  technical: CompareTechnicalComparison;
  competitorName: string;
  competitorSlug: string;
}) {
  return (
    <section className="col container gap-10 py-16 md:py-24">
      <Reveal>
        <SectionHeader
          align="center"
          description={technical.intro}
          label="For developers"
          title={technical.title}
          variant="sm"
        />
      </Reveal>
      <Reveal className="surface overflow-hidden" delay={80}>
        <div className="overflow-x-auto">
          <table className={STACKED_TABLE.table}>
            <thead className={STACKED_TABLE.section}>
              <tr
                className={cn(STACKED_TABLE.row, 'border-neutral-200 border-b')}
              >
                <th className={STACKED_TABLE.topicHead} scope="col">
                  <span className="sr-only">Topic</span>
                </th>
                <ColumnHeads
                  competitorName={competitorName}
                  competitorSlug={competitorSlug}
                />
              </tr>
            </thead>
            <tbody
              className={cn(
                STACKED_TABLE.section,
                'divide-y divide-neutral-100'
              )}
            >
              {technical.items.map((item) => (
                <tr className={STACKED_TABLE.row} key={item.label}>
                  <th className={STACKED_TABLE.topic} scope="row">
                    {item.label}
                  </th>
                  <td className={cn(STACKED_TABLE.cell, 'bg-blue-50/40')}>
                    <Value value={item.openpanel} />
                  </td>
                  <td className={cn(STACKED_TABLE.cell, 'text-neutral-600')}>
                    <div className="col gap-1.5">
                      <Value value={item.competitor} />
                      {item.notes && (
                        <span className="text-neutral-500 text-xs">
                          {item.notes}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </section>
  );
}
