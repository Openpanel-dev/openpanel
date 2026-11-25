import type { ComponentType } from 'react';
import { LiveCounter } from './live-counter';
import { LiveEventFeed } from './live-event-feed';
import { LiveGroupsFeed } from './live-groups-feed';
import type { RealtimeWidgetId } from './live-layout';
import { LivePeopleFeed } from './live-people-feed';
import { LiveSessionFeed } from './live-session-feed';
import { LiveTopPages } from './live-top-pages';
import { LiveVisitorBars } from './live-visitor-bars';

interface RealtimeWidget {
  label: string;
  description: string;
  Component: ComponentType<{ projectId: string }>;
}

export const REALTIME_WIDGETS: Record<RealtimeWidgetId, RealtimeWidget> = {
  online: {
    label: 'Online now',
    description: 'Active in the last 5 minutes',
    Component: LiveCounter,
  },
  visitors: {
    label: 'Last 30 minutes',
    description: 'Visitors per minute',
    Component: LiveVisitorBars,
  },
  sessions: {
    label: 'New sessions',
    description: 'Each visit as it starts',
    Component: LiveSessionFeed,
  },
  events: {
    label: 'Events',
    description: 'Live page views and events',
    Component: LiveEventFeed,
  },
  people: {
    label: 'People',
    description: 'Names and companies',
    Component: LivePeopleFeed,
  },
  groups: {
    label: 'Groups',
    description: 'Active companies and groups',
    Component: LiveGroupsFeed,
  },
  pages: {
    label: 'Top pages',
    description: 'Most visited paths',
    Component: LiveTopPages,
  },
};
