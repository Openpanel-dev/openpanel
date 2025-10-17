import { LogoSquare } from '@/components/logo';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { SellingPoint } from './selling-points';

const sellingPoints = [
  {
    key: 'welcome',
    render: () => (
      <SellingPoint
        bgImage="/img-1.webp"
        title="Best open-source alternative"
        description="Mixpanel too expensive, Google Analytics has no privacy, Amplitude old and boring"
      />
    ),
  },
  {
    key: 'selling-point-2',
    render: () => (
      <SellingPoint
        bgImage="/img-2.webp"
        title="Fast and reliable"
        description="Never miss a beat with our real-time analytics"
      />
    ),
  },
  {
    key: 'selling-point-3',
    render: () => (
      <SellingPoint
        bgImage="/img-3.webp"
        title="Easy to use"
        description="Compared to other tools we have kept it simple"
      />
    ),
  },
  {
    key: 'selling-point-4',
    render: () => (
      <SellingPoint
        bgImage="/img-4.webp"
        title="Privacy by default"
        description="We have built our platform with privacy at its heart"
      />
    ),
  },
  {
    key: 'selling-point-5',
    render: () => (
      <SellingPoint
        bgImage="/img-5.webp"
        title="Open source"
        description="You can inspect the code and self-host if you choose"
      />
    ),
  },
];

export function LoginLeftPanel() {
  return (
    <div className="relative h-screen overflow-hidden">
      <div className="row justify-between items-center p-8">
        <LogoSquare className="h-8 w-8" />
        <a
          href="https://openpanel.dev"
          className="text-sm text-muted-foreground"
        >
          Back to website →
        </a>
      </div>

      {/* Carousel */}
      <div className="flex items-center justify-center h-full">
        <Carousel
          className="w-full h-full [&>div]:h-full [&>div]:min-h-full"
          opts={{
            loop: true,
            align: 'center',
          }}
        >
          <CarouselContent className="h-full">
            {sellingPoints.map((point, index) => (
              <CarouselItem
                key={`selling-point-${point.key}`}
                className="p-8 pb-32 pt-0"
              >
                <div className="rounded-xl min-h-full h-full overflow-hidden bg-card border border-border shadow-lg">
                  {point.render()}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-12 bottom-30 top-auto" />
          <CarouselNext className="right-12 bottom-30 top-auto" />
        </Carousel>
      </div>
    </div>
  );
}
