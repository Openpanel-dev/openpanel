import { ColumnHeads } from './scoreboard';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareTechnicalComparison } from '@/lib/compare';

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
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-neutral-200 border-b">
                <th
                  className="w-1/4 px-5 py-4 font-medium text-neutral-500"
                  scope="col"
                >
                  <span className="sr-only">Topic</span>
                </th>
                <ColumnHeads
                  competitorName={competitorName}
                  competitorSlug={competitorSlug}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {technical.items.map((item) => (
                <tr className="align-top" key={item.label}>
                  <th className="px-5 py-4 font-medium" scope="row">
                    {item.label}
                  </th>
                  <td className="bg-blue-50/40 px-5 py-4">
                    <Value value={item.openpanel} />
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
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
