import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import type { RefObject } from 'react';
import type { DisplayMarker } from './map-types';
import {
  getBadgeOverlayPosition,
  getProfileDisplayName,
  getUniqueCoordinateDetailLocations,
  getUniquePlaceDetailLocations,
} from './map-utils';
import { ProjectLink } from '@/components/links';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useTRPC } from '@/integrations/trpc/react';

export function MapBadgeDetailCard({
  marker,
  onClose,
  panelRef,
  projectId,
  size,
}: {
  marker: DisplayMarker;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  projectId: string;
  size: { width: number; height: number };
}) {
  const trpc = useTRPC();
  const input = {
    detailScope: marker.detailScope,
    projectId,
    locations:
      marker.detailScope === 'coordinate'
        ? getUniqueCoordinateDetailLocations(marker.members)
        : getUniquePlaceDetailLocations(marker.members),
  };
  const query = useQuery(
    trpc.realtime.mapBadgeDetails.queryOptions(input, {
      enabled: input.locations.length > 0,
    })
  );
  const position = getBadgeOverlayPosition(marker, size);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="absolute z-[90]"
      initial={{ opacity: 0, y: -8 }}
      onMouseDown={(event) => event.stopPropagation()}
      ref={panelRef}
      style={{
        left: position.left,
        top: position.top,
        width: position.overlayWidth,
      }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        animate={{ opacity: 1 }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-background shadow-2xl"
        initial={{ opacity: 0.98 }}
        transition={{ duration: 0.18 }}
      >
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div className="min-w-0">
            <div className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
              Realtime cluster
            </div>
            <div className="truncate text-lg" style={{ fontWeight: 600 }}>
              {marker.label}
            </div>
            <div
              className="mt-1 text-muted-foreground"
              style={{ fontSize: 13 }}
            >
              {query.data?.summary.totalSessions ?? marker.count} sessions
              {query.data?.summary.totalProfiles
                ? ` • ${query.data.summary.totalProfiles} profiles`
                : ''}
            </div>
          </div>
          <button
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b p-4 text-sm">
          <div className="col gap-1 rounded-lg bg-def-200 p-3">
            <div className="text-muted-foreground text-xs">Locations</div>
            <div className="font-semibold">
              {query.data?.summary.totalLocations ?? marker.members.length}
            </div>
          </div>
          <div className="col gap-1 rounded-lg bg-def-200 p-3">
            <div className="text-muted-foreground text-xs">Countries</div>
            <div className="font-semibold">
              {query.data?.summary.totalCountries ?? 0}
            </div>
          </div>
          <div className="col gap-1 rounded-lg bg-def-200 p-3">
            <div className="text-muted-foreground text-xs">Cities</div>
            <div className="font-semibold">
              {query.data?.summary.totalCities ?? 0}
            </div>
          </div>
        </div>

        <div className="max-h-[420px] space-y-4 overflow-y-auto p-4">
          {query.isLoading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-def-200" />
              <div className="h-24 animate-pulse rounded-xl bg-def-200" />
              <div className="h-24 animate-pulse rounded-xl bg-def-200" />
            </div>
          ) : query.data ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <div className="mb-2 font-medium text-sm">Top referrers</div>
                  <div className="space-y-2">
                    {query.data.topReferrers.length > 0 ? (
                      query.data.topReferrers.map((item) => (
                        <div
                          className="flex items-center justify-between gap-2 text-sm"
                          key={item.referrerName || '(not set)'}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <SerieIcon name={item.referrerName} />
                            <span className="truncate">
                              {item.referrerName
                                .replaceAll('https://', '')
                                .replaceAll('http://', '')
                                .replaceAll('www.', '') || '(Not set)'}
                            </span>
                          </div>
                          <span className="font-mono">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No data
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="mb-2 font-medium text-sm">Top events</div>
                  <div className="space-y-2">
                    {query.data.topEvents.length > 0 ? (
                      query.data.topEvents.map((item) => (
                        <div
                          className="flex items-center justify-between gap-2 text-sm"
                          key={item.name}
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="font-mono">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No data
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-2 rounded-xl border p-3">
                  <div className="mb-2 font-medium text-sm">Top paths</div>
                  <div className="space-y-2">
                    {query.data.topPaths.length > 0 ? (
                      query.data.topPaths.map((item) => (
                        <div
                          className="flex items-center justify-between gap-2 text-sm"
                          key={`${item.origin}${item.path}`}
                        >
                          <span className="truncate">
                            {item.path || '(Not set)'}
                          </span>
                          <span className="font-mono">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No data
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="mb-3 font-medium text-sm">Recent sessions</div>
                <div className="space-y-3">
                  {query.data.recentProfiles.length > 0 ? (
                    query.data.recentProfiles.map((profile) => {
                      const href = profile.profileId
                        ? `/profiles/${encodeURIComponent(profile.profileId)}`
                        : `/sessions/${encodeURIComponent(profile.sessionId)}`;
                      return (
                        <ProjectLink
                          className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-def-200"
                          href={href}
                          key={
                            profile.profileId
                              ? `p:${profile.profileId}`
                              : `s:${profile.sessionId}`
                          }
                        >
                          <ProfileAvatar
                            avatar={profile.avatar}
                            email={profile.email}
                            firstName={profile.firstName}
                            lastName={profile.lastName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate"
                              style={{ fontSize: 14, fontWeight: 500 }}
                            >
                              {getProfileDisplayName(profile)}
                            </div>
                            <div
                              className="truncate text-muted-foreground"
                              style={{ fontSize: 12 }}
                            >
                              {profile.latestPath || profile.latestEvent}
                            </div>
                          </div>
                          <div
                            className="text-right text-muted-foreground"
                            style={{ fontSize: 12 }}
                          >
                            <div>
                              {[profile.city, profile.country]
                                .filter(Boolean)
                                .join(', ') || 'Unknown'}
                            </div>
                          </div>
                        </ProjectLink>
                      );
                    })
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      No recent sessions
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">
              Could not load badge details.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
