import type { IServiceEvent, IServiceSession } from '@openpanel/db';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { EventIcon } from '@/components/events/event-icon';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { ReplayShell } from '@/components/sessions/replay';
import { KeyValueGrid } from '@/components/ui/key-value-grid';
import {
  Widget,
  WidgetBody,
  WidgetHead,
  WidgetTitle,
} from '@/components/widget';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/sessions_/$sessionId'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.session.byId.queryOptions({
          sessionId: params.sessionId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.event.events.queryOptions({
          projectId: params.projectId,
          sessionId: params.sessionId,
          filters: [],
          columnVisibility: {},
        })
      ),
    ]);
  },
  head: () => ({
    meta: [{ title: createProjectTitle('Session') }],
  }),
  pendingComponent: FullPageLoadingState,
});

function sessionToFakeEvent(session: IServiceSession): IServiceEvent {
  return {
    ...session,
    name: 'screen_view',
    sessionId: session.id,
    properties: {},
    path: session.exitPath,
    origin: session.exitOrigin,
    importedAt: undefined,
    meta: undefined,
    sdkName: undefined,
    sdkVersion: undefined,
    profile: undefined,
  };
}

function VisitedRoutes({ paths }: { paths: string[] }) {
  const counted = paths.reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counted).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  if (sorted.length === 0) {
    return null;
  }

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>Visited pages</WidgetTitle>
      </WidgetHead>
      <div className="flex flex-col gap-1 p-1">
        {sorted.map(([path, count]) => (
          <div className="group relative px-3 py-2" key={path}>
            <div
              className="absolute top-0 bottom-0 left-0 rounded bg-def-200 group-hover:bg-def-300"
              style={{ width: `${(count / max) * 100}%` }}
            />
            <div className="relative flex min-w-0 justify-between gap-2">
              <span className="truncate text-sm">{path}</span>
              <span className="shrink-0 font-medium text-sm">{count}</span>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}

function EventDistribution({ events }: { events: IServiceEvent[] }) {
  const counted = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.name] = (acc[e.name] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counted).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  if (sorted.length === 0) {
    return null;
  }

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>Event distribution</WidgetTitle>
      </WidgetHead>
      <div className="flex flex-col gap-1 p-1">
        {sorted.map(([name, count]) => (
          <div className="group relative px-3 py-2" key={name}>
            <div
              className="absolute top-0 bottom-0 left-0 rounded bg-def-200 group-hover:bg-def-300"
              style={{ width: `${(count / max) * 100}%` }}
            />
            <div className="relative flex justify-between gap-2">
              <span className="text-sm">{name.replace(/_/g, ' ')}</span>
              <span className="shrink-0 font-medium text-sm">{count}</span>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}

function Component() {
  const { projectId, sessionId, organizationId } = Route.useParams();
  const trpc = useTRPC();
  const number = useNumber();

  const { data: session } = useSuspenseQuery(
    trpc.session.byId.queryOptions({ sessionId, projectId })
  );

  const { data: eventsData } = useSuspenseQuery(
    trpc.event.events.queryOptions({
      projectId,
      sessionId,
      filters: [],
      columnVisibility: {},
    })
  );

  const events = eventsData?.data ?? [];

  const isIdentified =
    session.profileId && session.profileId !== session.deviceId;

  const { data: profile } = useSuspenseQuery(
    trpc.profile.byId.queryOptions({
      profileId: session.profileId,
      projectId,
    })
  );

  const fakeEvent = sessionToFakeEvent(session);

  return (
    <PageContainer className="col gap-8">
      <PageHeader title={`Session: ${session.id}`}>
        <div className="row mb-6 gap-4">
          {session.country && (
            <div className="row items-center gap-2">
              <SerieIcon name={session.country} />
              <span>
                {session.country}
                {session.city && ` / ${session.city}`}
              </span>
            </div>
          )}
          {session.device && (
            <div className="row items-center gap-2">
              <SerieIcon name={session.device} />
              <span className="capitalize">{session.device}</span>
            </div>
          )}
          {session.os && (
            <div className="row items-center gap-2">
              <SerieIcon name={session.os} />
              <span>{session.os}</span>
            </div>
          )}
          {session.model && (
            <div className="row items-center gap-2">
              <SerieIcon name={session.model} />
              <span>{session.model}</span>
            </div>
          )}
          {session.browser && (
            <div className="row items-center gap-2">
              <SerieIcon name={session.browser} />
              <span>{session.browser}</span>
            </div>
          )}
        </div>
      </PageHeader>

      {session.hasReplay && (
        <ReplayShell projectId={projectId} sessionId={sessionId} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left column */}
        <div className="col gap-6">
          {/* Session info */}
          <Widget className="w-full">
            <WidgetHead>
              <WidgetTitle>Session info</WidgetTitle>
            </WidgetHead>
            <KeyValueGrid
              className="border-0"
              columns={1}
              copyable
              data={[
                {
                  name: 'duration',
                  value: number.formatWithUnit(session.duration / 1000, 'min'),
                },
                { name: 'createdAt', value: session.createdAt },
                { name: 'endedAt', value: session.endedAt },
                { name: 'screenViews', value: session.screenViewCount },
                { name: 'events', value: session.eventCount },
                { name: 'bounce', value: session.isBounce ? 'Yes' : 'No' },
                ...(session.entryPath
                  ? [{ name: 'entryPath', value: session.entryPath }]
                  : []),
                ...(session.exitPath
                  ? [{ name: 'exitPath', value: session.exitPath }]
                  : []),
                ...(session.referrerName
                  ? [{ name: 'referrerName', value: session.referrerName }]
                  : []),
                ...(session.referrer
                  ? [{ name: 'referrer', value: session.referrer }]
                  : []),
                ...(session.utmSource
                  ? [{ name: 'utmSource', value: session.utmSource }]
                  : []),
                ...(session.utmMedium
                  ? [{ name: 'utmMedium', value: session.utmMedium }]
                  : []),
                ...(session.utmCampaign
                  ? [{ name: 'utmCampaign', value: session.utmCampaign }]
                  : []),
                ...(session.revenue > 0
                  ? [{ name: 'revenue', value: `$${session.revenue}` }]
                  : []),
                { name: 'country', value: session.country, event: fakeEvent },
                ...(session.city
                  ? [{ name: 'city', value: session.city, event: fakeEvent }]
                  : []),
                ...(session.os
                  ? [{ name: 'os', value: session.os, event: fakeEvent }]
                  : []),
                ...(session.browser
                  ? [
                      {
                        name: 'browser',
                        value: session.browser,
                        event: fakeEvent,
                      },
                    ]
                  : []),
                ...(session.device
                  ? [
                      {
                        name: 'device',
                        value: session.device,
                        event: fakeEvent,
                      },
                    ]
                  : []),
                ...(session.brand
                  ? [{ name: 'brand', value: session.brand, event: fakeEvent }]
                  : []),
                ...(session.model
                  ? [{ name: 'model', value: session.model, event: fakeEvent }]
                  : []),
              ]}
            />
          </Widget>

          {/* Profile card */}
          {isIdentified && profile && (
            <Widget className="w-full">
              <WidgetHead>
                <WidgetTitle>Profile</WidgetTitle>
              </WidgetHead>
              <WidgetBody className="p-0">
                <Link
                  className="row items-center gap-3 p-4 transition-colors hover:bg-accent"
                  params={{
                    organizationId,
                    projectId,
                    profileId: session.profileId,
                  }}
                  to="/$organizationId/$projectId/profiles/$profileId"
                >
                  <ProfileAvatar {...profile} size="lg" />
                  <div className="col min-w-0 gap-0.5">
                    <span className="truncate font-medium">
                      {getProfileName(profile, false) ?? session.profileId}
                    </span>
                    {profile.email && (
                      <span className="truncate text-muted-foreground text-sm">
                        {profile.email}
                      </span>
                    )}
                  </div>
                </Link>
              </WidgetBody>
            </Widget>
          )}

          {/* Visited pages */}
          <VisitedRoutes
            paths={events
              .filter((e) => e.name === 'screen_view' && e.path)
              .map((e) => e.path)}
          />

          {/* Event distribution */}
          <EventDistribution events={events} />
        </div>

        {/* Right column */}
        <div className="col gap-6">
          {/* Events list */}
          <Widget className="w-full">
            <WidgetHead>
              <WidgetTitle>Events</WidgetTitle>
            </WidgetHead>
            <div className="divide-y">
              {events.map((event) => (
                <div
                  className="row items-center gap-3 px-4 py-2"
                  key={event.id}
                >
                  <EventIcon meta={event.meta} name={event.name} size="sm" />
                  <div className="col min-w-0 flex-1">
                    <span className="truncate font-medium text-sm">
                      {event.name === 'screen_view' && event.path
                        ? event.path
                        : event.name.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No events found
                </div>
              )}
            </div>
          </Widget>
        </div>
      </div>
    </PageContainer>
  );
}
