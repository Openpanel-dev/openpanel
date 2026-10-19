import { Section, SectionHeader } from '@/components/section';
import type { CompareStrengths } from '@/lib/compare';

export function CompetitorStrengths({
  strengths,
}: {
  strengths: CompareStrengths;
}) {
  return (
    <Section className="container">
      <SectionHeader
        description={strengths.intro}
        title={strengths.title}
        variant="sm"
      />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {strengths.items.map((item) => (
          <div
            className="col gap-2 rounded-2xl border bg-muted/20 p-6"
            key={item.title}
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
