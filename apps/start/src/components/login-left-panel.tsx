import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useTranslation } from 'react-i18next';
import { SellingPoint } from './selling-points';

const sellingPoints = [
  {
    key: 'alternative',
    bgImage: '/img-1.webp',
  },
  {
    key: 'reliable',
    bgImage: '/img-2.webp',
  },
  {
    key: 'simple',
    bgImage: '/img-3.webp',
  },
  {
    key: 'privacy',
    bgImage: '/img-4.webp',
  },
  {
    key: 'open_source',
    bgImage: '/img-5.webp',
  },
];

export function LoginLeftPanel() {
  const { t } = useTranslation();

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Carousel */}
      <div className="flex items-center justify-center h-full mt-24">
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
                  <SellingPoint
                    bgImage={point.bgImage}
                    title={t(`auth.login_panel_${point.key}_title`)}
                    description={t(`auth.login_panel_${point.key}_description`)}
                  />
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
