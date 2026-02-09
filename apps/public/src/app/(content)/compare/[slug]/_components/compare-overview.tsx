import { Section } from '@/components/section';
import type { CompareOverview as CompareOverviewData } from '@/lib/compare';

interface CompareOverviewProps {
  overview: CompareOverviewData;
}

export function CompareOverview({ overview }: CompareOverviewProps) {
  return (
    <Section className="container">
      <article className="col gap-6 max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-semibold">
          {overview.title}
        </h2>
        <div className="col gap-4">
          {overview.paragraphs.map((paragraph) => (
            <p
              key={paragraph.slice(0, 48)}
              className="text-muted-foreground leading-relaxed text-base md:text-lg"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </Section>
  );
}
