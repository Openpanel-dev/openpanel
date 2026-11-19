import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareStrengths } from '@/lib/compare';

const STAGGER_MS = 70;

// Where the competitor is ahead. Kept on purpose; it is what makes the
// rest of the page believable.
export function CompetitorStrengths({
  strengths,
}: {
  strengths: CompareStrengths;
}) {
  return (
    <section className="col container gap-10 py-16 md:py-24">
      <Reveal>
        <SectionHeader
          align="center"
          description={strengths.intro}
          label="Fair is fair"
          title={strengths.title}
          variant="sm"
        />
      </Reveal>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {strengths.items.map((item, index) => (
          <Reveal
            as="li"
            className="surface col gap-2 p-6"
            delay={index * STAGGER_MS}
            key={item.title}
          >
            <h3 className="font-medium">{item.title}</h3>
            <p className="text-neutral-600 text-sm leading-relaxed">
              {item.description}
            </p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
