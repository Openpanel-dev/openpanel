import { CompetitorMark } from './versus-mark';
import { Logo } from '@/components/logo';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareHighlights } from '@/lib/compare';

// Column heads shared by the scoreboard and the feature table.
export function ColumnHeads({
  competitorName,
  competitorSlug,
}: {
  competitorName: string;
  competitorSlug: string;
}) {
  return (
    <>
      <th className="bg-blue-50/60 px-5 py-4 text-left" scope="col">
        <span className="row items-center gap-2">
          <span className="center-center size-6 rounded-md bg-blue-600">
            <Logo className="h-2.5 w-auto text-white" />
          </span>
          <span className="font-semibold">OpenPanel</span>
        </span>
      </th>
      <th className="px-5 py-4 text-left" scope="col">
        <CompetitorMark name={competitorName} size="sm" slug={competitorSlug} />
      </th>
    </>
  );
}

// The five things that decide most evaluations, side by side.
export function Scoreboard({
  highlights,
  competitorName,
  competitorSlug,
}: {
  highlights: CompareHighlights;
  competitorName: string;
  competitorSlug: string;
}) {
  return (
    <section className="col container gap-10 py-16 md:py-24">
      <Reveal>
        <SectionHeader
          align="center"
          description={highlights.intro}
          label="At a glance"
          title={highlights.title}
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
              {highlights.items.map((item) => (
                <tr className="align-top" key={item.label}>
                  <th className="px-5 py-4 font-medium" scope="row">
                    {item.label}
                  </th>
                  <td className="bg-blue-50/40 px-5 py-4 font-medium text-neutral-900">
                    {item.openpanel}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {item.competitor}
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
