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

export function PreviewCarousel() {
  return (
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
          <CarouselItem
            key={item.url}
            className="flex-[0_0_80%] max-w-3xl pl-8"
          >
            <div className="aspect-video">
              <div className="p-3 rounded-xl overflow-hidden bg-gradient-to-b from-blue-100/50 to-white/50">
                <Image
                  className="w-full h-full object-cover rounded-lg"
                  src={item.url}
                  width={1080}
                  height={608}
                  alt={item.title}
                />
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:visible" />
      <CarouselNext className="hidden md:visible" />
    </Carousel>
  );
}
