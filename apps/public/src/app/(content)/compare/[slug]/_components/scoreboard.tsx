import { CompetitorMark } from './versus-mark';
import { Logo } from '@/components/logo';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareHighlights } from '@/lib/compare';
import { cn } from '@/lib/utils';

// Phones stack the topic above the two answers; three text columns do not
// fit side by side at that width.
export const STACKED_TABLE = {
  table: 'w-full text-left text-sm max-sm:block',
  section: 'max-sm:block',
  row: 'align-top max-sm:grid max-sm:grid-cols-2',
  topicHead: 'w-1/4 px-5 py-4 font-medium text-neutral-500 max-sm:hidden',
  topic: 'px-5 py-4 font-medium max-sm:col-span-2 max-sm:px-4 max-sm:pb-1',
  cell: 'px-5 py-4 max-sm:px-4',
} as const;

// Column heads shared by the scoreboard and the feature table.
export function ColumnHeads({
  competitorName,
  competitorSlug,
  logoOnlyOnPhone = false,
}: {
  competitorName: string;
  competitorSlug: string;
  logoOnlyOnPhone?: boolean;
}) {
  return (
    <>
      <th className="bg-blue-50/60 px-5 py-4 text-left max-sm:px-4" scope="col">
        <span className="row items-center gap-2">
          <span className="center-center size-6 rounded-md bg-blue-600">
            <Logo className="h-2.5 w-auto text-white" />
          </span>
          <span
            className={cn('font-semibold', logoOnlyOnPhone && 'max-sm:sr-only')}
          >
            OpenPanel
          </span>
        </span>
      </th>
      <th className="px-5 py-4 text-left max-sm:px-4" scope="col">
        <CompetitorMark
          logoOnlyOnPhone={logoOnlyOnPhone}
          name={competitorName}
          size="sm"
          slug={competitorSlug}
        />
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
              {highlights.items.map((item) => (
                <tr className={STACKED_TABLE.row} key={item.label}>
                  <th className={STACKED_TABLE.topic} scope="row">
                    {item.label}
                  </th>
                  <td
                    className={cn(
                      STACKED_TABLE.cell,
                      'bg-blue-50/40 font-medium text-neutral-900'
                    )}
                  >
                    {item.openpanel}
                  </td>
                  <td className={cn(STACKED_TABLE.cell, 'text-neutral-600')}>
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
