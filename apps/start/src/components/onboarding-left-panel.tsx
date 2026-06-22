import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { QuoteIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Testimonial = {
  key: string;
  bgImage: string;
  quoteKey: string;
  author?: string;
  authorKey?: string;
  site?: string;
};

const testimonials: Testimonial[] = [
  {
    key: 'thomas',
    bgImage: '/img-1.webp',
    quoteKey: 'onboarding.testimonial_thomas_quote',
    author: 'Thomas Sanlis',
    site: 'uneed.best',
  },
  {
    key: 'julien',
    bgImage: '/img-2.webp',
    quoteKey: 'onboarding.testimonial_julien_quote',
    author: 'Julien Hany',
    site: 'strackr.com',
  },
  {
    key: 'piotr',
    bgImage: '/img-3.webp',
    quoteKey: 'onboarding.testimonial_piotr_quote',
    author: 'Piotr Kulpinski',
    site: 'producthunt.com',
  },
  {
    key: 'selfhost',
    bgImage: '/img-4.webp',
    quoteKey: 'onboarding.testimonial_selfhost_quote',
    authorKey: 'onboarding.testimonial_selfhost_author',
    site: undefined,
  },
];

function TestimonialSlide({
  bgImage,
  quoteKey,
  author,
  authorKey,
  site,
}: {
  bgImage: string;
  quoteKey: string;
  author?: string;
  authorKey?: string;
  site?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-col justify-end h-full p-10 select-none">
      <img
        src={bgImage}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
      <div className="relative z-10 flex flex-col gap-4">
        <QuoteIcon className="size-10 text-white/40 stroke-1" />
        <blockquote className="text-3xl font-medium text-white leading-relaxed">
          {t(quoteKey)}
        </blockquote>
        <figcaption className="text-white/60 text-sm">
          — {authorKey ? t(authorKey) : author}
          {site && <span className="ml-1 text-white/40">· {site}</span>}
        </figcaption>
      </div>
    </div>
  );
}

export function OnboardingLeftPanel() {
  return (
    <div className="sticky top-0 h-screen overflow-hidden">
      <div className="flex items-center justify-center h-full mt-24">
        <Carousel
          className="w-full h-full [&>div]:h-full [&>div]:min-h-full"
          opts={{ loop: true, align: 'center' }}
          plugins={[Autoplay({ delay: 6000, stopOnInteraction: false })]}
        >
          <CarouselContent className="h-full">
            {testimonials.map((testimonial) => (
              <CarouselItem key={testimonial.key} className="p-8 pb-32 pt-0">
                <div className="rounded-xl min-h-full h-full overflow-hidden bg-card border border-border shadow-lg">
                  <TestimonialSlide
                    bgImage={testimonial.bgImage}
                    quoteKey={testimonial.quoteKey}
                    author={testimonial.author}
                    authorKey={testimonial.authorKey}
                    site={testimonial.site}
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
