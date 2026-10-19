import { Section, SectionHeader } from '@/components/section';
import type { CompareHighlights } from '@/lib/compare';

interface ScorecardProps {
  highlights: CompareHighlights;
  competitorName: string;
}

export function Scorecard({ highlights, competitorName }: ScorecardProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={highlights.intro}
        title={highlights.title}
        variant="sm"
      />
      <div className="mt-10 overflow-x-auto rounded-2xl border">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b bg-muted/30 text-sm">
              <th className="w-1/4 p-4 font-medium text-muted-foreground">
                <span className="sr-only">Topic</span>
              </th>
              <th className="p-4 font-semibold">OpenPanel</th>
              <th className="p-4 font-semibold">{competitorName}</th>
            </tr>
          </thead>
          <tbody>
            {highlights.items.map((item) => (
              <tr
                className="border-b align-top last:border-b-0"
                key={item.label}
              >
                <th className="p-4 font-medium text-sm" scope="row">
                  {item.label}
                </th>
                <td className="p-4 text-sm">{item.openpanel}</td>
                <td className="p-4 text-muted-foreground text-sm">
                  {item.competitor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
