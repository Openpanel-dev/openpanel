import Image from 'next/image';
import { Reveal } from '@/components/reveal';
import { Section } from '@/components/section';
import { TESTIMONIALS, type Testimonial } from '@/lib/testimonials';
import { cn } from '@/lib/utils';

const STAGGER_MS = 70;

// Turns the **highlight** markers in a quote into bold runs.
function renderQuote(quote: string) {
  return quote.split(/(\*\*[^*]+\*\*)/).map((part, index) =>
    part.startsWith('**') ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static text runs
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function Avatar({ item }: { item: Testimonial }) {
  if (item.avatarUrl) {
    return (
      <Image
        alt=""
        className="size-10 rounded-full object-cover"
        height={40}
        src={item.avatarUrl}
        width={40}
      />
    );
  }
  return (
    <span className="center-center size-10 rounded-full bg-neutral-100 font-medium text-neutral-600 text-sm">
      {initials(item.author)}
    </span>
  );
}

function Quote({ item, index }: { item: Testimonial; index: number }) {
  return (
    <Reveal
      as="li"
      className="mb-4 break-inside-avoid"
      delay={index * STAGGER_MS}
    >
      <figure className="col gap-6 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.12)] ring-1 ring-black/4">
        <blockquote
          className={cn(
            'text-pretty text-neutral-700 leading-relaxed [&_strong]:font-semibold [&_strong]:text-neutral-900',
            item.featured ? 'text-[17px]' : 'text-[15px]'
          )}
        >
          {renderQuote(item.quote)}
        </blockquote>
        <figcaption className="row items-center gap-3 text-sm">
          <Avatar item={item} />
          <span className="col">
            <span className="font-medium">{item.author}</span>
            <span className="text-neutral-500">
              {item.role}
              {item.company && (
                <>
                  {', '}
                  <a
                    className="underline-offset-4 hover:underline"
                    href={item.company.url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    {item.company.name}
                  </a>
                </>
              )}
            </span>
          </span>
        </figcaption>
      </figure>
    </Reveal>
  );
}

export function Testimonials({
  withHeader = true,
  className,
}: {
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <Section className={cn('container gap-8', className)}>
      {withHeader && (
        <h2 className="text-center font-semibold text-2xl tracking-tight">
          What our customers say
        </h2>
      )}
      <ul className="columns-1 gap-4 md:columns-2 lg:columns-3">
        {TESTIMONIALS.map((item, index) => (
          <Quote index={index} item={item} key={item.author} />
        ))}
      </ul>
    </Section>
  );
}
