import Image from 'next/image';
import { Section, SectionHeader } from '@/components/section';
import { cn } from '@/lib/utils';

interface Quote {
  avatarUrl: string;
  name: string;
  handle: string;
  quote: string;
}

const QUOTES: Quote[] = [
  {
    avatarUrl: '/twitter-steven.jpg',
    name: 'Steven Tey',
    handle: 'steventey',
    quote:
      'It combines the power of Mixpanel with the ease of use of Plausible into a fully open-source product.',
  },
  {
    avatarUrl: '/twitter-thomas.jpg',
    name: 'Thomas Sanlis',
    handle: 'T_Zahil',
    quote:
      "If you're looking for open source analytics, OpenPanel is by far the best I've ever seen. Bonus: 1-click install on Coolify.",
  },
  {
    avatarUrl: '/twitter-piotr.jpg',
    name: 'Piotr Kulpinski',
    handle: 'piotrkulpinski',
    quote:
      'The Overview tab has everything I need from my analytics: the stats, the graph, traffic sources, locations, devices. The UI is beautiful.',
  },
  {
    avatarUrl: '/twitter-jacob.jpg',
    name: 'Jacob',
    handle: 'javayhuwx',
    quote:
      'Integrated OpenPanel last night, and now I can see visitors coming from all around the world. More beautiful UI and much more powerful than Umami.',
  },
  {
    avatarUrl: '/twitter-pontus.jpg',
    name: 'Pontus Abrahamsson',
    handle: 'pontusab',
    quote: 'OpenPanel is a beast, love it!',
  },
  {
    avatarUrl: '/twitter-lee.jpg',
    name: 'Lee',
    handle: 'DutchEngIishman',
    quote:
      'Day two of marketing. I like this upward trend. P.S. OpenPanel is awesome.',
  },
];

export function Testimonials({
  limit = 6,
  withHeader = true,
  className,
}: {
  limit?: number;
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <Section className={cn('container gap-12', className)}>
      {withHeader && (
        <SectionHeader
          align="center"
          description="From indie hackers to teams running billions of events."
          title="Loved by people who ship"
        />
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {QUOTES.slice(0, limit).map((item) => (
          <li
            className="col justify-between gap-6 rounded-2xl border p-6"
            key={item.handle}
          >
            <blockquote className="text-pretty leading-relaxed">
              {item.quote}
            </blockquote>
            <figcaption className="row items-center gap-3">
              <Image
                alt={item.name}
                className="size-9 rounded-full object-cover"
                height={36}
                src={item.avatarUrl}
                width={36}
              />
              <span className="col text-sm">
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground">@{item.handle}</span>
              </span>
            </figcaption>
          </li>
        ))}
      </ul>
    </Section>
  );
}
