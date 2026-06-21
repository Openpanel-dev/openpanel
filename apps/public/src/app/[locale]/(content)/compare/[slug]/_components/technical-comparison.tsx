import { Section, SectionHeader } from '@/components/section';
import { CompareTechnicalComparison } from '@/lib/compare';
import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TechnicalComparisonProps {
  technical: CompareTechnicalComparison;
  competitorName: string;
}

function renderValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return (
      <ul className="col gap-1">
        {value.map((item, idx) => (
          <li key={idx} className="text-sm">
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
        title={technical.title}
        description={technical.intro}
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
              {technical.items.map((item, index) => (
                <tr
                  key={item.label}
                  className={cn(
                    'border-b last:border-b-0',
                    index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="p-4 font-medium">{item.label}</td>
                  <td className="p-4">{renderValue(item.openpanel)}</td>
                  <td className="p-4 text-muted-foreground">
                    <div className="col gap-1">
                      {renderValue(item.competitor)}
                      {item.notes && (
                        <span className="text-xs text-muted-foreground/70 mt-1">
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

