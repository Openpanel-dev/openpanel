import { SellingPoint } from './selling-points';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

const sellingPoints = [
  {
    key: 'welcome',
    render: () => (
      <SellingPoint
        bgImage="/img-1.webp"
        description="Mixpanel too expensive, Google Analytics has no privacy, Amplitude old and boring"
        title="Best open-source alternative"
      />
    ),
  },
  {
    key: 'selling-point-2',
    render: () => (
      <SellingPoint
        bgImage="/img-2.webp"
        description="Never miss a beat with our real-time analytics"
        title="Fast and reliable"
      />
    ),
  },
  {
    key: 'selling-point-3',
    render: () => (
      <SellingPoint
        bgImage="/img-3.webp"
        description="Compared to other tools we have kept it simple"
        title="Easy to use"
      />
    ),
  },
  {
    key: 'selling-point-4',
    render: () => (
      <SellingPoint
        bgImage="/img-4.webp"
        description="We have built our platform with privacy at its heart"
        title="Privacy by default"
      />
    ),
  },
  {
    key: 'selling-point-5',
    render: () => (
      <SellingPoint
        bgImage="/img-5.webp"
        description="You can inspect the code and self-host if you choose"
        title="Open source"
      />
    ),
  },
];

export function LoginLeftPanel() {
  return (
    <div className="relative h-screen overflow-hidden">
      <div className="mt-24 flex h-full items-center justify-center">
        <Carousel
          className="h-full w-full [&>div]:h-full [&>div]:min-h-full"
          opts={{
            loop: true,
            align: 'center',
          }}
        >
          <CarouselContent className="h-full">
            {sellingPoints.map((point, index) => (
              <CarouselItem
                className="p-8 pt-0 pb-32"
                key={`selling-point-${point.key}`}
              >
                <div className="h-full min-h-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {point.render()}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="top-auto bottom-30 left-12" />
          <CarouselNext className="top-auto right-12 bottom-30" />
        </Carousel>
      </div>
    </div>
  );
}
