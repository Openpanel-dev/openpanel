import Link from 'next/link';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import { cn } from '@/lib/utils';

export interface CardItem {
  title: string;
  description: string;
  // A small live-looking piece of UI, shown in the top 160 px of the card.
  visual?: React.ReactNode;
  href?: string;
}

const STAGGER_MS = 70;

function Card({ item }: { item: CardItem }) {
  const body = (
    <>
      {item.visual && (
        <div aria-hidden className="h-40 overflow-hidden">
          {item.visual}
        </div>
      )}
      <span className="col gap-1">
        <span className="font-medium">{item.title}</span>
        <span className="text-neutral-600 text-sm">{item.description}</span>
      </span>
    </>
  );
  if (item.href) {
    return (
      <Link
        className="group surface surface-hover col h-full gap-5 p-6"
        href={item.href}
      >
        {body}
      </Link>
    );
  }
  return <div className="surface col h-full gap-5 p-6">{body}</div>;
}

// A grid of white cards, each with a mini replica and two lines of text.
export function CardGrid({
  label,
  title,
  description,
  items,
  columns = 3,
  className,
  id,
}: {
  label?: string;
  title?: string;
  description?: string;
  items: CardItem[];
  columns?: 2 | 3;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={cn('col container gap-12 py-16 md:py-24', className)}
      id={id}
    >
      {title && (
        <Reveal>
          <SectionHeader
            align="center"
            description={description}
            label={label}
            title={title}
            variant="sm"
          />
        </Reveal>
      )}
      <ul
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          columns === 3 && 'lg:grid-cols-3'
        )}
      >
        {items.map((item, index) => (
          <Reveal as="li" delay={index * STAGGER_MS} key={item.title}>
            <Card item={item} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
