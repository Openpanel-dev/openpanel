import { useEffect, useState } from 'react';
import { ChatPreview } from './chat-preview';
import { cn } from '@/utils/cn';

const ROTATE_EVERY_MS = 7000;

const TESTIMONIALS: { quote: string; author: string; site?: string }[] = [
  {
    quote:
      "OpenPanel is by far the best open-source analytics I've ever seen. Better UX, more features, and incredible support from the founder.",
    author: 'Thomas Sanlis',
    site: 'uneed.best',
  },
  {
    quote:
      'It combines the power of Mixpanel with the ease of use of Plausible into a fully open-source product.',
    author: 'Steven Tey',
    site: 'dub.co',
  },
  {
    quote:
      'After testing several product analytics tools we chose OpenPanel. Profiles and conversion events are our favorite features.',
    author: 'Julien Hany',
    site: 'strackr.com',
  },
  {
    quote:
      'The Overview tab has everything I need: stats, graph, traffic sources, locations, devices. Clean, modern, very pleasing to the eye.',
    author: 'Piotr Kulpinski',
    site: 'producthunt.com',
  },
  {
    quote:
      'After paying a lot to PostHog for years, OpenPanel gives us the same analytics while keeping full ownership of our data.',
    author: 'Self-hosting team',
  },
];

function useRotatingIndex(length: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % length),
      ROTATE_EVERY_MS
    );
    return () => window.clearInterval(timer);
  }, [length]);
  return [index, setIndex] as const;
}

export function AuthShowcase() {
  const [index, setIndex] = useRotatingIndex(TESTIMONIALS.length);
  const testimonial = TESTIMONIALS[index] ?? TESTIMONIALS[0]!;

  return (
    <aside className="relative hidden overflow-hidden lg:m-3 lg:flex lg:flex-col lg:justify-between lg:rounded-2xl lg:bg-def-200 lg:p-12 xl:p-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-highlight/10 blur-3xl"
      />
      <div className="col relative min-h-0 max-w-lg flex-1 gap-6">
        <h2 className="font-semibold text-3xl leading-tight tracking-tight">
          Ask your analytics a question. Get the chart back.
        </h2>
        <p className="text-base text-muted-foreground">
          Web and product analytics in one place, open source, and a chat that
          answers with charts.
        </p>
        <ChatPreview className="min-h-0 flex-1" />
      </div>

      <figure className="col relative mt-8 max-w-lg shrink-0 gap-5 rounded-xl bg-background p-6 shadow-sm">
        <blockquote
          className="fade-in animate-in text-base leading-relaxed duration-500 motion-reduce:animate-none"
          key={testimonial.author}
        >
          “{testimonial.quote}”
        </blockquote>
        <div className="row items-center justify-between gap-4">
          <figcaption className="text-sm">
            <span className="font-medium">{testimonial.author}</span>
            {testimonial.site && (
              <span className="text-muted-foreground">
                {' '}
                · {testimonial.site}
              </span>
            )}
          </figcaption>
          <div aria-hidden="true" className="row gap-1.5">
            {TESTIMONIALS.map((item, dotIndex) => (
              <button
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  dotIndex === index
                    ? 'w-5 bg-foreground'
                    : 'w-1.5 bg-def-400 hover:bg-foreground/60'
                )}
                key={item.author}
                onClick={() => setIndex(dotIndex)}
                tabIndex={-1}
                type="button"
              />
            ))}
          </div>
        </div>
      </figure>
    </aside>
  );
}
