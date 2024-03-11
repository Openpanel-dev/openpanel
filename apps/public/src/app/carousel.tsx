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
    url: '/demo-2/1.png',
  },
  {
    title: 'Histogram, perfect for showing active users',
    url: '/demo-2/2.png',
  },
  { title: 'Make your overview public', url: '/demo-2/3.png' },
  {
    title: 'See real time events from your users',
    url: '/demo-2/4.png',
  },
  { title: 'The classic line chart', url: '/demo-2/5.png' },
  {
    title: 'Bar charts to see your most popular content',
    url: '/demo-2/6.png',
  },
  { title: 'Get nice metric cards with graphs', url: '/demo-2/7.png' },
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
            <div
              style={{
                aspectRatio: 2982 / 1484,
              }}
            >
              <div className="p-1 rounded-xl overflow-hidden bg-gradient-to-b from-blue-100/50 to-white/50">
                <Image
                  priority
                  className="w-full h-full object-cover rounded-lg"
                  src={item.url}
                  width={2982 * 0.5}
                  height={1484 * 0.5}
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
