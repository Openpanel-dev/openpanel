import type { IChartMetric } from '@openpanel/core/modules/report/report.constants';
import { useEffect, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { MetricCard } from './metric-card';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import { cn } from '@/utils/cn';

const MIN_CARD_WIDTH = 200;
const MAX_CARDS_PER_PAGE = 3;
const CARD_BASIS = {
  1: 'basis-full',
  2: 'basis-1/2',
  3: 'basis-1/3',
} as const;

interface MetricPagerProps {
  series: IVisibleSeries;
  metric: IChartMetric;
  unit?: string;
}

// A tile shows as many whole metric cards as fit side by side; the rest are
// a swipe away, one page per set.
export function MetricPager({ series, metric, unit }: MetricPagerProps) {
  return (
    <AutoSizer>
      {({ width, height }) => {
        const perPage = Math.max(
          1,
          Math.min(MAX_CARDS_PER_PAGE, Math.floor(width / MIN_CARD_WIDTH))
        ) as keyof typeof CARD_BASIS;
        return (
          <Pages
            height={height}
            key={perPage}
            metric={metric}
            perPage={perPage}
            series={series}
            unit={unit}
            width={width}
          />
        );
      }}
    </AutoSizer>
  );
}

function Pages({
  series,
  metric,
  unit,
  perPage,
  width,
  height,
}: MetricPagerProps & {
  perPage: keyof typeof CARD_BASIS;
  width: number;
  height: number;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(series.length / perPage);

  useEffect(() => {
    if (!api) {
      return;
    }
    const onSelect = () => setPage(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  return (
    <div className="relative" style={{ width, height }}>
      <Carousel
        className="h-full [&>div]:h-full"
        opts={{ align: 'start', slidesToScroll: perPage }}
        setApi={setApi}
      >
        <CarouselContent className="h-full">
          {series.map((serie) => (
            <CarouselItem
              className={cn('h-full pl-0', CARD_BASIS[perPage])}
              key={serie.id}
            >
              <MetricCard fill metric={metric} serie={serie} unit={unit} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {pageCount > 1 && (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              aria-label={`Page ${index + 1} of ${pageCount}`}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                index === page ? 'bg-foreground' : 'bg-foreground/20'
              )}
              key={series[index * perPage]?.id ?? index}
              onClick={() => api?.scrollTo(index)}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  );
}
