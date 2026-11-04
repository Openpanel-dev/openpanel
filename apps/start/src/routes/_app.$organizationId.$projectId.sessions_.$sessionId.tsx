import type { IServiceProfile, IServiceSession } from '@openpanel/core';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  CopyIcon,
  Loader2Icon,
  VideoIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { AiUsageWidget } from '@/components/ai/ai-usage-widget';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { MostEvents } from '@/components/profiles/most-events';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { SessionJourney } from '@/components/sessions/details/session-journey';
import { SessionMetrics } from '@/components/sessions/details/session-metrics';
import { groupEventsByPage } from '@/components/sessions/details/session-pages';
import { SessionProperties } from '@/components/sessions/details/session-properties';
import { SessionTimeline } from '@/components/sessions/details/session-timeline';
import { ReplayShell } from '@/components/sessions/replay';
import {
  MAX_SESSION_EVENTS,
  type SessionEventsStatus,
  sessionEventsQueryOptions,
  useSessionEvents,
} from '@/components/sessions/use-session-events';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Widget,
  WidgetBody,
  WidgetHead,
  WidgetTitle,
} from '@/components/widget';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { useEntityPageContext } from '@/hooks/use-page-context-helpers';
import { useTRPC } from '@/integrations/trpc/react';
import { clipboard } from '@/utils/clipboard';
import { formatDateTime } from '@/utils/date';
import { getProfileName } from '@/utils/getters';
import { createProjectTitle } from '@/utils/title';

const MS_PER_SECOND = 1000;

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
      context.queryClient.prefetchInfiniteQuery(
        sessionEventsQueryOptions(context.trpc, {
          projectId: params.projectId,
          sessionId: params.sessionId,
        })
      ),
    ]);
  },
  head: () => ({
    meta: [{ title: createProjectTitle('Session') }],
  }),
  pendingComponent: FullPageLoadingState,
});

function HeaderFact({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="row items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function SessionFacts({ session }: { session: IServiceSession }) {
  const location = [session.city, session.country].filter(Boolean).join(', ');
  return (
    <div className="row mb-6 flex-wrap gap-x-5 gap-y-2">
      <HeaderFact icon={<CalendarIcon className="size-4" />}>
        {formatDateTime(session.createdAt)}
      </HeaderFact>
      <HeaderFact icon={<ClockIcon className="size-4" />}>
        {fancyMinutes(session.duration / MS_PER_SECOND)}
      </HeaderFact>
      {location && (
        <HeaderFact icon={<SerieIcon name={session.country || session.city} />}>
          {location}
        </HeaderFact>
      )}
      {session.referrerName && (
        <HeaderFact icon={<SerieIcon name={session.referrerName} />}>
          {session.referrerName}
        </HeaderFact>
      )}
      {session.device && (
        <HeaderFact icon={<SerieIcon name={session.device} />}>
          <span className="capitalize">{session.device}</span>
        </HeaderFact>
      )}
      {session.os && (
        <HeaderFact icon={<SerieIcon name={session.os} />}>
          {session.os}
        </HeaderFact>
      )}
      {session.browser && (
        <HeaderFact icon={<SerieIcon name={session.browser} />}>
          {session.browser}
        </HeaderFact>
      )}
    </div>
  );
}

// Everything below is built from the loaded events, except the metric totals.
const EVENT_DERIVED_SECTIONS =
  'the journey, timeline, unique pages, popular events and replay activity';

function SessionEventsNotice({
  status,
  onRetry,
}: {
  status: SessionEventsStatus;
  onRetry: () => void;
}) {
  if (status === 'complete') {
    return null;
  }
  if (status === 'loading') {
    return (
      <div className="row items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        Loading the rest of this session's events…
      </div>
    );
  }
  return (
    <Alert className="row items-center justify-between gap-4">
      <AlertDescription>
        {status === 'failed'
          ? `Some of this session's events could not be loaded, so ${EVENT_DERIVED_SECTIONS} are incomplete.`
          : `This session has more than ${MAX_SESSION_EVENTS.toLocaleString()} events. Only the latest ${MAX_SESSION_EVENTS.toLocaleString()} are used for ${EVENT_DERIVED_SECTIONS}.`}
      </AlertDescription>
      {status === 'failed' && (
        <Button onClick={onRetry} size="sm" variant="outline">
          Retry
        </Button>
      )}
    </Alert>
  );
}

function VisitorCard({
  profile,
  session,
  organizationId,
  projectId,
}: {
  profile: IServiceProfile | null | undefined;
  session: IServiceSession;
  organizationId: string;
  projectId: string;
}) {
  const isIdentified = session.profileId !== session.deviceId;
  const name = profile && isIdentified ? getProfileName(profile, false) : null;

  return (
    <Widget className="w-full overflow-hidden">
      <WidgetHead>
        <WidgetTitle>Visitor</WidgetTitle>
      </WidgetHead>
      <WidgetBody className="p-0">
        <Link
          className="group row items-center gap-3 p-4 transition-colors hover:bg-def-100"
          params={{ organizationId, projectId, profileId: session.profileId }}
          to="/$organizationId/$projectId/profiles/$profileId"
        >
          <ProfileAvatar {...profile} size="lg" />
          <div className="col min-w-0 flex-1 gap-0.5">
            <span className="truncate font-medium">
              {name ?? 'Anonymous visitor'}
            </span>
            <span className="truncate text-muted-foreground text-sm">
              {profile?.email || session.profileId}
            </span>
          </div>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </WidgetBody>
    </Widget>
  );
}

function SessionGroups({
  groupIds,
  organizationId,
  projectId,
}: {
  groupIds: string[];
  organizationId: string;
  projectId: string;
}) {
  const trpc = useTRPC();
  const { data: groups } = useQuery({
    ...trpc.group.listByIds.queryOptions({ projectId, ids: groupIds }),
    enabled: groupIds.length > 0,
  });

  if (!groups?.length) {
    return null;
  }

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>Groups</WidgetTitle>
      </WidgetHead>
      <div className="divide-y">
        {groups.map((group) => (
          <Link
            className="row items-center gap-3 px-4 py-3 transition-colors hover:bg-def-100"
            key={group.id}
            params={{ organizationId, projectId, groupId: group.id }}
            to="/$organizationId/$projectId/groups/$groupId"
          >
            <div className="col min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{group.name}</span>
              <span className="truncate text-muted-foreground text-sm tabular-nums">
                {group.id}
              </span>
            </div>
            <span className="shrink-0 rounded border px-1.5 py-0.5 text-muted-foreground text-xs">
              {group.type}
            </span>
          </Link>
        ))}
      </div>
    </Widget>
  );
}

function Component() {
  const { projectId, sessionId, organizationId } = Route.useParams();
  const trpc = useTRPC();

  const { data: session } = useSuspenseQuery(
    trpc.session.byId.queryOptions({ sessionId, projectId })
  );

  useEntityPageContext('session', { sessionId });

  const {
    events,
    status: eventsStatus,
    retry: retryEvents,
  } = useSessionEvents(trpc, { projectId, sessionId });

  const { data: profile } = useSuspenseQuery(
    trpc.profile.byId.queryOptions({
      profileId: session.profileId,
      projectId,
    })
  );

  const visits = useMemo(
    () => groupEventsByPage(events, session.endedAt),
    [events, session.endedAt]
  );
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const isIdentified = session.profileId !== session.deviceId;
  const title =
    profile && isIdentified
      ? getProfileName(profile, false)
      : 'Anonymous visitor';

  return (
    <PageContainer className="col gap-6">
      <PageHeader
        actions={
          <>
            {session.hasReplay && (
              <Button
                icon={VideoIcon}
                onClick={() =>
                  document
                    .getElementById('replay')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                variant="outline"
              >
                Watch replay
              </Button>
            )}
            <Button
              icon={CopyIcon}
              onClick={() => clipboard(session.id, 'Session id copied')}
              variant="outline"
            >
              Copy id
            </Button>
          </>
        }
        title={
          <div className="row min-w-0 items-center gap-4">
            <ProfileAvatar {...profile} />
            <span className="truncate">{title}</span>
            <span className="shrink-0 rounded-md bg-def-200 px-2 py-0.5 font-medium text-muted-foreground text-xs">
              Session
            </span>
          </div>
        }
      >
        <SessionFacts session={session} />
      </PageHeader>

      <SessionEventsNotice onRetry={retryEvents} status={eventsStatus} />

      <SessionMetrics events={events} session={session} />

      {session.hasReplay && (
        <ReplayShell
          events={events}
          projectId={projectId}
          sessionId={sessionId}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <aside className="col gap-6">
          <VisitorCard
            organizationId={organizationId}
            profile={profile}
            projectId={projectId}
            session={session}
          />
          <SessionProperties session={session} />
          <SessionGroups
            groupIds={session.groups ?? []}
            organizationId={organizationId}
            projectId={projectId}
          />
          <AiUsageWidget
            className="w-full"
            entity={{ kind: 'session', sessionId }}
            projectId={projectId}
          />
          {eventCounts.length > 0 && <MostEvents data={eventCounts} />}
        </aside>

        <div className="col min-w-0 gap-6">
          <SessionJourney visits={visits} />
          <SessionTimeline sessionStart={session.createdAt} visits={visits} />
        </div>
      </div>
    </PageContainer>
  );
}
