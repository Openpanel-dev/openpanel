import type { IServiceEvent } from '@openpanel/core';

export interface SessionPageVisit {
  /** The screen view that opened the page; null for events before the first one. */
  view: IServiceEvent | null;
  path: string;
  startedAt: number;
  durationMs: number;
  events: IServiceEvent[];
}

function toMs(date: Date | string): number {
  return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

function pagePath(event: IServiceEvent): string {
  return event.path || '/';
}

/**
 * Within one millisecond the query's order is arbitrary, so an event goes after
 * a screen view only when it happened on that view's page.
 */
function compareEvents(a: IServiceEvent, b: IServiceEvent): number {
  const difference = toMs(a.createdAt) - toMs(b.createdAt);
  const aIsView = a.name === 'screen_view';
  const bIsView = b.name === 'screen_view';
  if (difference !== 0 || aIsView === bIsView) {
    return difference;
  }
  const view = aIsView ? a : b;
  const other = aIsView ? b : a;
  const viewGoesFirst = pagePath(other) === pagePath(view);
  return viewGoesFirst === aIsView ? -1 : 1;
}

export function sortEventsAscending(events: IServiceEvent[]): IServiceEvent[] {
  return [...events].sort(compareEvents);
}

/** Splits a session's events into page visits, each lasting until the next page. */
export function groupEventsByPage(
  events: IServiceEvent[],
  sessionEndedAt: Date
): SessionPageVisit[] {
  const visits: SessionPageVisit[] = [];
  for (const event of sortEventsAscending(events)) {
    const isPageView = event.name === 'screen_view';
    const current = visits.at(-1);
    if (isPageView || !current) {
      visits.push({
        view: isPageView ? event : null,
        path: isPageView ? pagePath(event) : '',
        startedAt: toMs(event.createdAt),
        durationMs: 0,
        events: isPageView ? [] : [event],
      });
      continue;
    }
    current.events.push(event);
  }

  const endedAt = toMs(sessionEndedAt);
  for (const [index, visit] of visits.entries()) {
    const next = visits[index + 1];
    const lastEvent = visit.events.at(-1);
    const end =
      next?.startedAt ??
      Math.max(endedAt, lastEvent ? toMs(lastEvent.createdAt) : 0);
    visit.durationMs = Math.max(0, end - visit.startedAt);
  }
  return visits;
}

export function getElapsedMs(event: IServiceEvent, sessionStart: Date): number {
  return Math.max(0, toMs(event.createdAt) - toMs(sessionStart));
}
