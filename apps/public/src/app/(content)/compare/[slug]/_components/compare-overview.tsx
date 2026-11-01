import { Reveal } from '@/components/reveal';
import { SectionLabel } from '@/components/section';
import type { CompareOverview as CompareOverviewData } from '@/lib/compare';

// The long-form read, for people who want the reasoning and for search.
export function CompareOverview({
  overview,
}: {
  overview: CompareOverviewData;
}) {
  return (
    <section className="container grid grid-cols-1 gap-8 py-16 md:grid-cols-[5fr_7fr] md:gap-20 md:py-24">
      <Reveal className="col gap-4">
        <SectionLabel>In depth</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          {overview.title}
        </h2>
      </Reveal>
      <Reveal className="col gap-5 text-neutral-600 leading-relaxed" delay={80}>
        {overview.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </Reveal>
    </section>
  );
}
