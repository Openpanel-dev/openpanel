import { ProjectLink } from '@/components/links';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { DropdownMenuShortcut } from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTRPC } from '@/integrations/trpc/react';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import type { IReportInput } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useState } from 'react';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';
import { ScrollableModal, useScrollableModal } from './Modal/scrollable-modal';

const ProfileItem = ({ profile }: { profile: any }) => {
  return (
    <ProjectLink
      preload={false}
      href={`/profiles/${encodeURIComponent(profile.id)}`}
      title={getProfileName(profile, false)}
      className="col gap-2 rounded-lg border p-2 bg-card"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          return;
        }
        popModal();
      }}
    >
      <div className="row gap-2 items-center">
        <ProfileAvatar {...profile} />
        <div className="flex-1">
          <div className="font-medium">{getProfileName(profile)}</div>
        </div>
      </div>

      <div className="row gap-4 text-sm overflow-hidden">
        {profile.properties.country && (
          <div className="row gap-2 items-center">
            <SerieIcon name={profile.properties.country} />
            <span>
              {profile.properties.country}
              {profile.properties.city && ` / ${profile.properties.city}`}
            </span>
          </div>
        )}
        {profile.properties.os && (
          <div className="row gap-2 items-center">
            <SerieIcon name={profile.properties.os} />
            <span>{profile.properties.os}</span>
          </div>
        )}
        {profile.properties.browser && (
          <div className="row gap-2 items-center">
            <SerieIcon name={profile.properties.browser} />
            <span>{profile.properties.browser}</span>
          </div>
        )}
      </div>
    </ProjectLink>
  );
};
// Shared profile list component
function ProfileList({ profiles }: { profiles: any[] }) {
  const ITEM_HEIGHT = 74;
  const CONTAINER_PADDING = 20;
  const ITEM_GAP = 5;
  const { scrollAreaRef } = useScrollableModal();
  const [isScrollReady, setIsScrollReady] = useState(false);

  // Check if scroll container is ready
  useEffect(() => {
    if (scrollAreaRef.current) {
      setIsScrollReady(true);
    } else {
      setIsScrollReady(false);
    }
  }, [scrollAreaRef]);

  const virtualizer = useVirtualizer({
    count: profiles.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: () => ITEM_HEIGHT + ITEM_GAP,
    overscan: 5,
    paddingStart: CONTAINER_PADDING,
    paddingEnd: CONTAINER_PADDING,
  });

  // Re-measure when scroll container becomes available or profiles change
  useEffect(() => {
    if (isScrollReady && scrollAreaRef.current) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        virtualizer.measure();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isScrollReady, profiles.length, virtualizer]);

  if (profiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">No users found</div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Only the visible items in the virtualizer, manually positioned to be in view */}
      {virtualItems.map((virtualItem) => {
        const profile = profiles[virtualItem.index];
        return (
          <div
            key={profile.id}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              padding: `0px ${CONTAINER_PADDING}px ${ITEM_GAP}px`,
            }}
          >
            <ProfileItem profile={profile} />
          </div>
        );
      })}
    </div>
  );
}

// Chart-specific props and component
interface ChartUsersViewProps {
  chartData: IChartData;
  report: IReportInput;
  date: string;
}

function ChartUsersView({ chartData, report, date }: ChartUsersViewProps) {
  const trpc = useTRPC();
  const [selectedSerieId, setSelectedSerieId] = useState<string | null>(
    report.series[0]?.id || null,
  );
  const [selectedBreakdownId, setSelectedBreakdownId] = useState<string | null>(
    null,
  );

  const selectedReportSerie = useMemo(
    () => report.series.find((s) => s.id === selectedSerieId),
    [report.series, selectedSerieId],
  );

  // Get all chart series that match the selected report serie
  const matchingChartSeries = useMemo(() => {
    if (!selectedSerieId || !chartData) return [];
    return chartData.series.filter((s) => s.event.id === selectedSerieId);
  }, [chartData?.series, selectedSerieId]);

  const selectedBreakdown = useMemo(() => {
    if (!selectedBreakdownId) return null;
    return matchingChartSeries.find((s) => s.id === selectedBreakdownId);
  }, [matchingChartSeries, selectedBreakdownId]);

  // Reset breakdown selection when serie changes
  const handleSerieChange = (value: string) => {
    setSelectedSerieId(value);
    setSelectedBreakdownId(null);
  };

  const profilesQuery = useQuery(
    trpc.chart.getProfiles.queryOptions(
      {
        projectId: report.projectId,
        date: date,
        series:
          selectedReportSerie && selectedReportSerie.type === 'event'
            ? [selectedReportSerie]
            : [],
        breakdowns: selectedBreakdown?.event.breakdowns,
        interval: report.interval,
      },
      {
        enabled: !!selectedReportSerie && selectedReportSerie.type === 'event',
      },
    ),
  );

  const profiles = profilesQuery.data ?? [];

  return (
    <ScrollableModal
      header={
        <div>
          <ModalHeader
            title="View Users"
            text={`Users who performed actions on ${new Date(date).toLocaleDateString()}`}
          />
          {report.series.length > 0 && (
            <div className="col md:row gap-2">
              <Select
                value={selectedSerieId || ''}
                onValueChange={handleSerieChange}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select Serie" />
                </SelectTrigger>
                <SelectContent>
                  {report.series.map((serie) => (
                    <SelectItem key={serie.id} value={serie.id || ''}>
                      {serie.type === 'event'
                        ? serie.displayName || serie.name
                        : serie.displayName || 'Formula'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {matchingChartSeries.length > 1 && (
                <Select
                  value={selectedBreakdownId || ''}
                  onValueChange={(value) => setSelectedBreakdownId(value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select Breakdown" />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingChartSeries
                      .sort((a, b) => b.metrics.sum - a.metrics.sum)
                      .map((serie) => (
                        <SelectItem key={serie.id} value={serie.id}>
                          {Object.values(serie.event.breakdowns ?? {}).join(
                            ', ',
                          )}
                          <DropdownMenuShortcut className="ml-auto">
                            ({serie.data.find((d) => d.date === date)?.count})
                          </DropdownMenuShortcut>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className="col">
        {profilesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading users...</div>
          </div>
        ) : (
          <ProfileList profiles={profiles} />
        )}
      </div>
    </ScrollableModal>
  );
}

// Funnel-specific props and component
interface FunnelUsersViewProps {
  report: IReportInput;
  stepIndex: number;
}

function FunnelUsersView({ report, stepIndex }: FunnelUsersViewProps) {
  const trpc = useTRPC();
  const [showDropoffs, setShowDropoffs] = useState(false);

  const profilesQuery = useQuery(
    trpc.chart.getFunnelProfiles.queryOptions(
      {
        projectId: report.projectId,
        startDate: report.startDate!,
        endDate: report.endDate!,
        range: report.range,
        series: report.series,
        stepIndex: stepIndex,
        showDropoffs: showDropoffs,
        funnelWindow:
          report.options?.type === 'funnel'
            ? report.options.funnelWindow
            : undefined,
        funnelGroup:
          report.options?.type === 'funnel'
            ? report.options.funnelGroup
            : undefined,
        breakdowns: report.breakdowns,
      },
      {
        enabled: stepIndex !== undefined,
      },
    ),
  );

  const profiles = profilesQuery.data ?? [];
  const isLastStep = stepIndex === report.series.length - 1;

  return (
    <ScrollableModal
      header={
        <div className="flex flex-col gap-2">
          <ModalHeader
            title="View Users"
            text={
              showDropoffs
                ? `Users who dropped off after step ${stepIndex + 1} of ${report.series.length}`
                : `Users who completed step ${stepIndex + 1} of ${report.series.length} in the funnel`
            }
          />
          {!isLastStep && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDropoffs(false)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  !showDropoffs
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setShowDropoffs(true)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  showDropoffs
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                Dropped Off
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {profilesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading users...</div>
          </div>
        ) : (
          <ProfileList profiles={profiles} />
        )}
      </div>
    </ScrollableModal>
  );
}

// Union type for props
type ViewChartUsersProps =
  | {
      type: 'chart';
      chartData: IChartData;
      report: IReportInput;
      date: string;
    }
  | {
      type: 'funnel';
      report: IReportInput;
      stepIndex: number;
    };

// Main component that routes to the appropriate view
export default function ViewChartUsers(props: ViewChartUsersProps) {
  if (props.type === 'funnel') {
    return (
      <FunnelUsersView report={props.report} stepIndex={props.stepIndex} />
    );
  }

  return (
    <ChartUsersView
      chartData={props.chartData}
      report={props.report}
      date={props.date}
    />
  );
}
