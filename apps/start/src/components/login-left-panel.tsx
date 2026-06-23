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
    titleKey: 'auth.login_panel_alternative_title',
    descriptionKey: 'auth.login_panel_alternative_description',
    bgImage: '/img-1.webp',
  },
  {
    titleKey: 'auth.login_panel_reliable_title',
    descriptionKey: 'auth.login_panel_reliable_description',
    bgImage: '/img-2.webp',
  },
  {
    titleKey: 'auth.login_panel_simple_title',
    descriptionKey: 'auth.login_panel_simple_description',
    bgImage: '/img-3.webp',
  },
  {
    titleKey: 'auth.login_panel_privacy_title',
    descriptionKey: 'auth.login_panel_privacy_description',
    bgImage: '/img-4.webp',
  },
  {
    titleKey: 'auth.login_panel_open_source_title',
    descriptionKey: 'auth.login_panel_open_source_description',
    bgImage: '/img-5.webp',
  },
] as const;

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
                key={point.titleKey}
                className="p-8 pb-32 pt-0"
              >
                <div className="rounded-xl min-h-full h-full overflow-hidden bg-card border border-border shadow-lg">
                  <SellingPoint
                    bgImage={point.bgImage}
                    title={t(point.titleKey)}
                    description={t(point.descriptionKey)}
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
