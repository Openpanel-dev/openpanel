import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Reveal } from '@/components/reveal';
import { SectionLabel } from '@/components/section';
import { cn } from '@/lib/utils';

export interface PillarPoint {
  title: string;
  text: string;
}

// Text beside a product window: eyebrow, title, lede, three points, a link.
// The visual is usually <VisualMock frame="inset" bleed="right" … />.
export function Pillar({
  id,
  label,
  title,
  description,
  points,
  link,
  visual,
  reverse,
}: {
  id?: string;
  label: string;
  title: string;
  description: string;
  points: PillarPoint[];
  link?: { href: string; text: string };
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section
      className="container grid grid-cols-1 items-center gap-10 py-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 md:py-20"
      id={id}
    >
      <Reveal className={cn('col gap-6', reverse && 'md:order-2')}>
        <SectionLabel>{label}</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          {title}
        </h2>
        <p className="text-lg text-neutral-600">{description}</p>
        <dl className="col gap-4 border-neutral-200 border-t pt-5">
          {points.map((point) => (
            <div className="col gap-0.5" key={point.title}>
              <dt className="font-medium">{point.title}</dt>
              <dd className="text-neutral-600 text-sm">{point.text}</dd>
            </div>
          ))}
        </dl>
        {link && (
          <Link
            className="row w-fit items-center gap-1.5 font-medium transition-colors hover:text-blue-700"
            href={link.href}
          >
            {link.text}
            <ArrowRightIcon className="size-4" />
          </Link>
        )}
      </Reveal>
      <Reveal className={cn('min-w-0', reverse && 'md:order-1')} delay={120}>
        {visual}
      </Reveal>
    </section>
  );
}
