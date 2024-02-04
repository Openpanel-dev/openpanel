'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import Image from 'next/image';

const images = [
  {
    title: 'Beautiful overview, everything is clickable to get more details',
    url: '/demo/overview-min.png',
  },
  {
    title: 'Histogram, perfect for showing active users',
    url: '/demo/histogram-min.png',
  },
  { title: 'Make your overview public', url: '/demo/overview-share-min.png' },
  {
    title: 'See real time events from your users',
    url: '/demo/events-min.png',
  },
  { title: 'The classic line chart', url: '/demo/line-min.png' },
  {
    title: 'Bar charts to see your most popular content',
    url: '/demo/bar-min.png',
  },
  { title: 'Get nice metric cards with graphs', url: '/demo/metrics-min.png' },
  { title: 'See where your events comes from', url: '/demo/worldmap-min.png' },
  { title: 'The classic pie chart', url: '/demo/pie-min.png' },
];

export function HomeCarousel() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="relative">
        <div className="rounded-lg w-full max-w-6xl aspect-video dashed absolute -left-5 -top-5"></div>
        <Carousel
          className="w-full"
          opts={{ loop: true }}
          plugins={[
            Autoplay({
              delay: 2000,
            }),
          ]}
        >
          <CarouselContent>
            {images.map((item) => (
              <CarouselItem key={item.url}>
                <div className="aspect-video rounded-md overflow-hidden">
                  <Image
                    className="w-full h-full object-cover"
                    src={item.url}
                    width={1080}
                    height={608}
                    alt={item.title}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:visible" />
          <CarouselNext className="hidden md:visible" />
        </Carousel>
      </div>
    </div>
  );
}
