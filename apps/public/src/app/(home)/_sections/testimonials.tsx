import { Section, SectionHeader } from '@/components/section';
import { cn } from '@/lib/utils';

interface CustomerQuote {
  quote: React.ReactNode;
  author: string;
  role: string;
  company?: { name: string; url: string };
}

const QUOTES: CustomerQuote[] = [
  {
    quote: (
      <>
        After testing several product analytics tools for Strackr,{' '}
        <strong>
          we chose OpenPanel and we are very satisfied with the product
        </strong>
        . We have been using it since the beta, and there are constant updates.
        Profiles and conversion events are our favourite features.
      </>
    ),
    author: 'Julien Hany',
    role: 'Founder',
    company: { name: 'Strackr', url: 'https://strackr.com' },
  },
  {
    quote: (
      <>
        After paying a lot to PostHog for years, OpenPanel gives us the same, in
        many ways better, analytics while keeping full ownership of our data.{' '}
        <strong>
          It's truly self-hosted but surprisingly low maintenance.
        </strong>{' '}
        The support is fantastic. We honestly don't want to run any business
        without OpenPanel anymore.
      </>
    ),
    author: 'Engineering team',
    role: 'Self-hosted customer, switched from PostHog',
  },
  {
    quote: (
      <>
        Before OpenPanel I was using Plausible, and it was ok.{' '}
        <strong>But OpenPanel is like 10 leagues ahead.</strong> Better UX and
        UI, many more features, and incredible support from the founder. Bonus
        point: one-click install on Coolify. I won't switch to anything else.
      </>
    ),
    author: 'Thomas Sanlis',
    role: 'Founder',
    company: { name: 'Uneed', url: 'https://uneed.best' },
  },
];

export function Testimonials({
  withHeader = true,
  className,
}: {
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <Section className={cn('container gap-12', className)}>
      {withHeader && (
        <SectionHeader
          align="center"
          title="What our customers say"
          variant="sm"
        />
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {QUOTES.map((item) => (
          <li
            className="col justify-between gap-8 rounded-2xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.12)] ring-1 ring-black/4"
            key={item.author}
          >
            <blockquote className="text-pretty text-[15px] text-neutral-700 leading-relaxed [&_strong]:font-semibold [&_strong]:text-neutral-900">
              “{item.quote}”
            </blockquote>
            <figcaption className="col text-sm">
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
            </figcaption>
          </li>
        ))}
      </ul>
    </Section>
  );
}
