import { Section, SectionHeader } from '@/components/section';
import type { CompareTechnicalComparison } from '@/lib/compare';
import { cn } from '@/lib/utils';

interface TechnicalComparisonProps {
  technical: CompareTechnicalComparison;
  competitorName: string;
}

function TechnicalValue({ value }: { value: string | string[] }) {
  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <li
            className="rounded-md border bg-muted/30 px-2 py-0.5 text-xs"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-sm">{value}</span>;
}

export function TechnicalComparison({
  technical,
  competitorName,
}: TechnicalComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={technical.intro}
        title={technical.title}
        variant="sm"
      />
      <div className="mt-12 overflow-hidden rounded-2xl border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-4 text-left font-semibold">Feature</th>
                <th className="p-4 text-left font-semibold">OpenPanel</th>
                <th className="p-4 text-left font-semibold">
                  {competitorName}
                </th>
              </tr>
            </thead>
            <tbody>
              {technical.items.map((item, index) => (
                <tr
                  className={cn(
                    'border-b last:border-b-0',
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                  key={item.label}
                >
                  <td className="p-4 align-top font-medium">{item.label}</td>
                  <td className="p-4 align-top">
                    <TechnicalValue value={item.openpanel} />
                  </td>
                  <td className="p-4 align-top text-muted-foreground">
                    <div className="col gap-1">
                      <TechnicalValue value={item.competitor} />
                      {item.notes && (
                        <span className="mt-1 text-muted-foreground/70 text-xs">
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
      </div>
    </Section>
  );
}
