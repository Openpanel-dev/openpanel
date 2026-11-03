import { CheckIcon, ChevronDownIcon, MinusIcon } from 'lucide-react';
import { ColumnHeads } from './scoreboard';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareFeatureComparison } from '@/lib/compare';

// Rows shown before the "show all" fold.
const VISIBLE_ROWS = 10;

const YES_VALUES = new Set(['yes', 'true', '✓']);
const NO_VALUES = new Set(['no', 'false', '✗']);

function normalise(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value;
  }
  const lower = value.toLowerCase().trim();
  if (YES_VALUES.has(lower)) {
    return true;
  }
  if (NO_VALUES.has(lower)) {
    return false;
  }
  return value;
}

function Cell({ value: raw }: { value: boolean | string }) {
  const value = normalise(raw);
  if (value === true) {
    return (
      <span className="center-center size-6 rounded-full bg-emerald-50 text-emerald-700">
        <CheckIcon aria-label="Yes" className="size-3.5" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="center-center size-6 rounded-full bg-neutral-100 text-neutral-400">
        <MinusIcon aria-label="No" className="size-3.5" />
      </span>
    );
  }
  return <span className="text-sm">{value}</span>;
}

// Every feature row, grouped, with the OpenPanel column tinted.
function GroupRows({
  group,
  features,
}: {
  group: string;
  features: CompareFeatureComparison['groups'][number]['features'];
}) {
  return (
    <tbody className="divide-y divide-neutral-100">
      <tr>
        <th
          className="px-5 pt-6 pb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wider"
          colSpan={3}
          scope="colgroup"
        >
          {group}
        </th>
      </tr>
      {features.map((feature) => (
        <tr className="align-top" key={feature.name}>
          <th className="px-5 py-3 font-medium" scope="row">
            {feature.name}
            {feature.notes && (
              <p className="mt-0.5 font-normal text-neutral-500 text-xs">
                {feature.notes}
              </p>
            )}
          </th>
          <td className="bg-blue-50/40 px-5 py-3">
            <Cell value={feature.openpanel} />
          </td>
          <td className="px-5 py-3 text-neutral-600">
            <Cell value={feature.competitor} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// Every feature row, grouped, with the OpenPanel column tinted. The first
// rows are open; the rest sit behind one "show all".
export function FeatureTable({
  featureComparison,
  competitorName,
  competitorSlug,
}: {
  featureComparison: CompareFeatureComparison;
  competitorName: string;
  competitorSlug: string;
}) {
  const visible: typeof featureComparison.groups = [];
  const folded: typeof featureComparison.groups = [];
  let shown = 0;
  for (const group of featureComparison.groups) {
    if (shown < VISIBLE_ROWS) {
      visible.push(group);
      shown += group.features.length;
    } else {
      folded.push(group);
    }
  }
  const foldedCount = folded.reduce(
    (total, group) => total + group.features.length,
    0
  );
  const heads = (
    <thead>
      <tr className="border-neutral-200 border-b">
        <th
          className="w-2/5 px-5 py-4 font-medium text-neutral-500"
          scope="col"
        >
          Feature
        </th>
        <ColumnHeads
          competitorName={competitorName}
          competitorSlug={competitorSlug}
        />
      </tr>
    </thead>
  );
  return (
    <section className="col container gap-10 py-16 md:py-24" id="features">
      <Reveal>
        <SectionHeader
          align="center"
          description={featureComparison.intro}
          label="Feature by feature"
          title={featureComparison.title}
          variant="sm"
        />
      </Reveal>
      <Reveal className="surface overflow-hidden" delay={80}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            {heads}
            {visible.map((group) => (
              <GroupRows
                features={group.features}
                group={group.group}
                key={group.group}
              />
            ))}
          </table>
        </div>
        {folded.length > 0 && (
          <details className="group border-neutral-200 border-t">
            <summary className="row cursor-pointer list-none items-center justify-center gap-2 px-5 py-4 font-medium text-sm hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">
                Show {foldedCount} more features
              </span>
              <span className="hidden group-open:inline">Show fewer</span>
              <ChevronDownIcon className="size-4 text-neutral-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="overflow-x-auto border-neutral-200 border-t">
              <table className="w-full text-left text-sm">
                {heads}
                {folded.map((group) => (
                  <GroupRows
                    features={group.features}
                    group={group.group}
                    key={group.group}
                  />
                ))}
              </table>
            </div>
          </details>
        )}
      </Reveal>
    </section>
  );
}
