import Link from 'next/link';
import { CountUp } from '@/components/count-up';
import { Reveal } from '@/components/reveal';
import { TESTIMONIALS } from '@/lib/testimonials';

export interface ProofStat {
  value: string;
  label: string;
}

function Quote({ index }: { index: number }) {
  const testimonial = TESTIMONIALS[index] ?? TESTIMONIALS[0];
  const text = testimonial.quote.replaceAll('**', '');
  return (
    <figure className="col mx-auto max-w-3xl items-center gap-5 text-center">
      <blockquote className="text-balance font-medium text-xl leading-snug tracking-[-0.01em] md:text-2xl">
        “{text}”
      </blockquote>
      <figcaption className="text-neutral-500 text-sm">
        {testimonial.author}, {testimonial.role}
        {testimonial.company && (
          <>
            {' at '}
            <Link
              className="font-medium text-neutral-900 underline-offset-4 hover:underline"
              href={testimonial.company.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {testimonial.company.name}
            </Link>
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Stats({ stats }: { stats: ProofStat[] }) {
  return (
    <dl className="mx-auto grid max-w-3xl grid-cols-1 gap-8 text-center sm:grid-cols-3">
      {stats.map((stat) => (
        <div className="col gap-1" key={stat.label}>
          <dd className="font-mono font-semibold text-4xl tabular-nums tracking-tight">
            <CountUp value={stat.value} />
          </dd>
          <dt className="text-neutral-500 text-sm">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

// Proof before the long explanation: one customer quote (an index into
// TESTIMONIALS) or three numbers.
export function ProofStrip({
  quote,
  stats,
}: {
  quote?: number;
  stats?: ProofStat[];
}) {
  return (
    <section className="container py-16 md:py-20">
      <Reveal>
        {stats ? <Stats stats={stats} /> : <Quote index={quote ?? 0} />}
      </Reveal>
    </section>
  );
}
