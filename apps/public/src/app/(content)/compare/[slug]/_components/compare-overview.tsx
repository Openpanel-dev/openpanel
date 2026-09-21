import { Section } from '@/components/section';
import type { CompareOverview as CompareOverviewData } from '@/lib/compare';

interface CompareOverviewProps {
  overview: CompareOverviewData;
}

export function CompareOverview({ overview }: CompareOverviewProps) {
  return (
    <Section className="container">
      <article className="col max-w-3xl gap-6">
        <h2 className="font-semibold text-3xl md:text-4xl">{overview.title}</h2>
        <div className="col gap-4">
          {overview.paragraphs.map((paragraph) => (
            <p
              className="text-base text-muted-foreground leading-relaxed md:text-lg"
              key={paragraph.slice(0, 48)}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </Section>
  );
}
