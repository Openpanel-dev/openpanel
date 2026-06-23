import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewMapProps {
  projectId: string;
  shareId?: string;
}

export function OverviewMap({ projectId, shareId }: OverviewMapProps) {
  const { t } = useTranslation();
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();

  const query = useQuery(
    trpc.overview.map.queryOptions({
      projectId,
      shareId,
      range,
      filters,
      startDate,
      endDate,
    }),
  );

  const mapData = useMemo(() => {
    if (!query.data) return [];

    // Aggregate by country (sum counts for same country)
    const countryMap = new Map<string, number>();
    query.data.forEach((item) => {
      const country = item.country.toLowerCase();
      const current = countryMap.get(country) ?? 0;
      countryMap.set(country, current + item.count);
    });

    return Array.from(countryMap.entries()).map(([country, value]) => ({
      country,
      value,
    }));
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">{t('overview.loading_map')}</div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">
          {t('overview.error_loading_map')}
        </div>
      </div>
    );
  }

  if (!query.data || mapData.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">
          {t('overview.no_data_available')}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ minHeight: 300 }}>
      <AutoSizer disableHeight>
        {({ width }) => (
          <WorldMap
            onClickFunction={(event) => {
              if (event.countryCode) {
                setFilter('country', event.countryCode);
              }
            }}
            size={width}
            data={mapData}
            color={'var(--chart-0)'}
            borderColor={'var(--foreground)'}
          />
        )}
      </AutoSizer>
    </div>
  );
}
