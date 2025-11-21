import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTRPC } from '@/integrations/trpc/react';
import type { IChartData } from '@/trpc/client';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface ViewChartUsersProps {
  chartData: IChartData;
  report: IChartInput;
  date: string;
}

export default function ViewChartUsers({
  chartData,
  report,
  date,
}: ViewChartUsersProps) {
  const trpc = useTRPC();

  // Group series by base event/formula (ignoring breakdowns)
  const baseSeries = useMemo(() => {
    const grouped = new Map<
      string,
      {
        baseName: string;
        baseEventId: string;
        reportSerie: IChartInput['series'][0] | undefined;
        breakdownSeries: Array<{
          serie: IChartData['series'][0];
          breakdowns: Record<string, string> | undefined;
        }>;
      }
    >();

    chartData.series.forEach((serie) => {
      const baseEventId = serie.event.id || '';
      const baseName = serie.names[0] || 'Unnamed Serie';

      if (!grouped.has(baseEventId)) {
        const reportSerie = report.series.find((ss) => ss.id === baseEventId);
        grouped.set(baseEventId, {
          baseName,
          baseEventId,
          reportSerie,
          breakdownSeries: [],
        });
      }

      const group = grouped.get(baseEventId);
      if (!group) return;
      // Extract breakdowns from serie.event.breakdowns (set in format.ts)
      const breakdowns = (serie.event as any).breakdowns;

      group.breakdownSeries.push({
        serie,
        breakdowns,
      });
    });

    return Array.from(grouped.values());
  }, [chartData.series, report.series, report.breakdowns]);

  const [selectedBaseSerieId, setSelectedBaseSerieId] = useState<string | null>(
    null,
  );
  const [selectedBreakdownIndex, setSelectedBreakdownIndex] = useState<
    number | null
  >(null);

  const selectedBaseSerie = useMemo(
    () => baseSeries.find((bs) => bs.baseEventId === selectedBaseSerieId),
    [baseSeries, selectedBaseSerieId],
  );

  const selectedBreakdown = useMemo(() => {
    if (
      !selectedBaseSerie ||
      selectedBreakdownIndex === null ||
      !selectedBaseSerie.breakdownSeries[selectedBreakdownIndex]
    ) {
      return null;
    }
    return selectedBaseSerie.breakdownSeries[selectedBreakdownIndex];
  }, [selectedBaseSerie, selectedBreakdownIndex]);

  // Reset breakdown selection when base serie changes
  const handleBaseSerieChange = (value: string) => {
    setSelectedBaseSerieId(value);
    setSelectedBreakdownIndex(null);
  };

  const selectedSerie = selectedBreakdown || selectedBaseSerie;

  const profilesQuery = useQuery(
    trpc.chart.getProfiles.queryOptions(
      {
        projectId: report.projectId,
        date: date,
        series:
          selectedSerie &&
          selectedBaseSerie?.reportSerie &&
          selectedBaseSerie.reportSerie.type === 'event'
            ? [selectedBaseSerie.reportSerie]
            : [],
        breakdowns: selectedBreakdown?.breakdowns,
        interval: report.interval,
      },
      {
        enabled:
          !!selectedSerie &&
          !!selectedBaseSerie?.reportSerie &&
          selectedBaseSerie.reportSerie.type === 'event',
      },
    ),
  );

  const profiles = profilesQuery.data ?? [];

  return (
    <ModalContent>
      <ModalHeader title="View Users" />
      <p className="text-sm text-muted-foreground mb-4">
        Users who performed actions on {new Date(date).toLocaleDateString()}
      </p>
      <div className="flex flex-col gap-4">
        {baseSeries.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Serie:</label>
              <Select
                value={selectedBaseSerieId || ''}
                onValueChange={handleBaseSerieChange}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Serie" />
                </SelectTrigger>
                <SelectContent>
                  {baseSeries.map((baseSerie) => (
                    <SelectItem
                      key={baseSerie.baseEventId}
                      value={baseSerie.baseEventId}
                    >
                      {baseSerie.baseName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBaseSerie &&
              selectedBaseSerie.breakdownSeries.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Breakdown:</label>
                  <Select
                    value={selectedBreakdownIndex?.toString() || ''}
                    onValueChange={(value) =>
                      setSelectedBreakdownIndex(
                        value ? Number.parseInt(value, 10) : null,
                      )
                    }
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All Breakdowns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Breakdowns</SelectItem>
                      {selectedBaseSerie.breakdownSeries.map((bdSerie, idx) => (
                        <SelectItem
                          key={bdSerie.serie.id}
                          value={idx.toString()}
                        >
                          {bdSerie.serie.names.slice(1).join(' > ') ||
                            'No Breakdown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </div>
        )}
        {profilesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading users...</div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">No users found</div>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.firstName || profile.email}
                      className="size-10 rounded-full"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <UsersIcon size={20} />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium">
                      {profile.firstName || profile.lastName
                        ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                        : profile.email || 'Anonymous'}
                    </div>
                    {profile.email && (
                      <div className="text-sm text-muted-foreground">
                        {profile.email}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Close
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}
