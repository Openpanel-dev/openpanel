import { CountUp } from '@/components/count-up';
import { Reveal } from '@/components/reveal';

export interface SplitStatItem {
  value: string;
  title: string;
  text: string;
}

// A row of big numbers, each with a one-line claim: "30 days · kept that
// long", "48 tools · everything the dashboard knows".
export function SplitStat({ items }: { items: SplitStatItem[] }) {
  return (
    <section className="container py-12 md:py-16">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((item, index) => (
          <Reveal
            as="div"
            className="surface col gap-3 p-6"
            delay={index * 80}
            key={item.title}
          >
            <dd className="font-mono font-semibold text-4xl tabular-nums tracking-tight">
              <CountUp value={item.value} />
            </dd>
            <dt className="col gap-0.5">
              <span className="font-medium">{item.title}</span>
              <span className="text-neutral-600 text-sm">{item.text}</span>
            </dt>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
