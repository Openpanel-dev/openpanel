import Autoplay from 'embla-carousel-autoplay';
import { QuoteIcon } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';

const testimonials = [
  {
    key: 'thomas',
    bgImage: '/img-1.webp',
    quote:
      "OpenPanel is BY FAR the best open-source analytics I've ever seen. Better UX/UI, many more features, and incredible support from the founder.",
    author: 'Thomas Sanlis',
    site: 'uneed.best',
  },
  {
    key: 'julien',
    bgImage: '/img-2.webp',
    quote:
      'After testing several product analytics tools, we chose OpenPanel and we are very satisfied. Profiles and Conversion Events are our favorite features.',
    author: 'Julien Hany',
    site: 'strackr.com',
  },
  {
    key: 'piotr',
    bgImage: '/img-3.webp',
    quote:
      'The Overview tab is great — it has everything I need. The UI is beautiful, clean, modern, very pleasing to the eye.',
    author: 'Piotr Kulpinski',
    site: 'producthunt.com',
  },
  {
    key: 'selfhost',
    bgImage: '/img-4.webp',
    quote:
      "After paying a lot to PostHog for years, OpenPanel gives us the same — in many ways better — analytics while keeping full ownership of our data. We don't want to run any business without OpenPanel anymore.",
    author: 'Self-hosting user',
    site: undefined,
  },
];

function TestimonialSlide({
  bgImage,
  quote,
  author,
  site,
}: {
  bgImage: string;
  quote: string;
  author: string;
  site?: string;
}) {
  return (
    <div className="relative flex h-full select-none flex-col justify-end p-10">
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        src={bgImage}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
      <div className="relative z-10 flex flex-col gap-4">
        <QuoteIcon className="size-10 stroke-1 text-white/40" />
        <blockquote className="font-medium text-3xl text-white leading-relaxed">
          {quote}
        </blockquote>
        <figcaption className="text-sm text-white/60">
          — {author}
          {site && <span className="ml-1 text-white/40">· {site}</span>}
        </figcaption>
      </div>
    </div>
  );
}

export function OnboardingLeftPanel() {
  return (
    <div className="sticky top-0 h-screen overflow-hidden">
      <div className="mt-24 flex h-full items-center justify-center">
        <Carousel
          className="h-full w-full [&>div]:h-full [&>div]:min-h-full"
          opts={{ loop: true, align: 'center' }}
          plugins={[Autoplay({ delay: 6000, stopOnInteraction: false })]}
        >
          <CarouselContent className="h-full">
            {testimonials.map((t) => (
              <CarouselItem className="p-8 pt-0 pb-32" key={t.key}>
                <div className="h-full min-h-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <TestimonialSlide
                    author={t.author}
                    bgImage={t.bgImage}
                    quote={t.quote}
                    site={t.site}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
