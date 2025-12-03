import { Section, SectionHeader } from '@/components/section';
import { CompareHighlights, CompareFeatureComparison } from '@/lib/compare';
import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComparisonTableProps {
  highlights: CompareHighlights;
  featureComparison: CompareFeatureComparison;
  competitorName: string;
}

function renderValue(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckIcon className="size-5 text-green-500" />
    ) : (
      <XIcon className="size-5 text-muted-foreground" />
    );
  }
  // Check for common yes/no patterns
  const lower = value.toLowerCase().trim();
  if (lower === 'yes' || lower === 'true' || lower.includes('✓')) {
    return <CheckIcon className="size-5 text-green-500" />;
  }
  if (lower === 'no' || lower === 'false' || lower.includes('✗')) {
    return <XIcon className="size-5 text-muted-foreground" />;
  }
  return <span className="text-sm">{value}</span>;
}

export function ComparisonTable({
  highlights,
  featureComparison,
  competitorName,
}: ComparisonTableProps) {
  // Flatten feature groups into rows
  const featureRows = featureComparison.groups.flatMap((group) =>
    group.features.map((feature) => ({
      feature: feature.name,
      openpanel: feature.openpanel,
      competitor: feature.competitor,
      notes: feature.notes,
    })),
  );

  const allRows = [
    ...highlights.items.map((h) => ({
      feature: h.label,
      openpanel: h.openpanel,
      competitor: h.competitor,
      notes: null,
    })),
    ...featureRows,
  ];

  return (
    <Section className="container">
      <SectionHeader
        title={highlights.title}
        description={highlights.intro}
        variant="sm"
      />
      <div className="mt-12 border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-4 font-semibold">Feature</th>
                <th className="text-left p-4 font-semibold">OpenPanel</th>
                <th className="text-left p-4 font-semibold">{competitorName}</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, index) => (
                <tr
                  key={row.feature}
                  className={cn(
                    'border-b last:border-b-0',
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="p-4 font-medium">{row.feature}</td>
                  <td className="p-4">
                    <div className="row gap-2 items-center">
                      {renderValue(row.openpanel)}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="col gap-1">
                      <div className="row gap-2 items-center text-muted-foreground">
                        {renderValue(row.competitor)}
                      </div>
                      {row.notes && (
                        <span className="text-xs text-muted-foreground/70 mt-1">
                          {row.notes}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

