import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareFeatureComparison } from '@/lib/compare';

interface ComparisonTableProps {
  featureComparison: CompareFeatureComparison;
  competitorName: string;
}

const YES_VALUES = new Set(['yes', 'true', '✓']);
const NO_VALUES = new Set(['no', 'false', '✗']);

function toBoolean(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.toLowerCase().trim();
  if (YES_VALUES.has(normalized)) {
    return true;
  }
  if (NO_VALUES.has(normalized)) {
    return false;
  }
  return value;
}

function FeatureValue({ value: rawValue }: { value: boolean | string }) {
  const value = toBoolean(rawValue);
  if (value === true) {
    return <CheckIcon aria-label="Yes" className="size-5 text-emerald-600" />;
  }
  if (value === false) {
    return (
      <XIcon aria-label="No" className="size-5 text-muted-foreground/60" />
    );
  }
  return <span className="text-sm">{value}</span>;
}

export function ComparisonTable({
  featureComparison,
  competitorName,
}: ComparisonTableProps) {
  const featureCount = featureComparison.groups.reduce(
    (total, group) => total + group.features.length,
    0
  );

  return (
    <Section className="container">
      <SectionHeader
        description={featureComparison.intro}
        title={featureComparison.title}
        variant="sm"
      />
      <details className="group mt-10 rounded-2xl border">
        <summary className="row cursor-pointer list-none items-center justify-between gap-4 p-4 font-medium [&::-webkit-details-marker]:hidden">
          <span>Show all {featureCount} features</span>
          <ChevronDownIcon className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-muted/30 text-sm">
                <th className="p-4 font-medium text-muted-foreground">
                  Feature
                </th>
                <th className="p-4 font-semibold">OpenPanel</th>
                <th className="p-4 font-semibold">{competitorName}</th>
              </tr>
            </thead>
            {featureComparison.groups.map((group) => (
              <tbody key={group.group}>
                <tr className="border-b bg-muted/10">
                  <th
                    className="p-4 pt-6 font-semibold text-muted-foreground text-xs uppercase tracking-wider"
                    colSpan={3}
                    scope="colgroup"
                  >
                    {group.group}
                  </th>
                </tr>
                {group.features.map((feature) => (
                  <tr className="border-b align-top" key={feature.name}>
                    <th className="p-4 font-medium text-sm" scope="row">
                      {feature.name}
                      {feature.notes && (
                        <p className="mt-1 font-normal text-muted-foreground text-xs">
                          {feature.notes}
                        </p>
                      )}
                    </th>
                    <td className="p-4">
                      <FeatureValue value={feature.openpanel} />
                    </td>
                    <td className="p-4 text-muted-foreground">
                      <FeatureValue value={feature.competitor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </details>
    </Section>
  );
}
