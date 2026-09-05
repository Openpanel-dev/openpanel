// Ported from apps/worker/src/jobs/lib/win-back-highlight.ts (M9-003, the
// wave that deletes apps/worker). Behaviour is V1's, verbatim; only the
// wiring changed — the two stats lookups and the AI call arrive as injected
// deps (`WinBackHighlightDeps`) instead of static imports, the same idiom the
// session lifecycle uses (modules/session/src/runtime.ts): the job handler
// binds them to the real core services through `loadWinBackHighlightDeps`,
// and tests hand in stubs, so no `mock.module` is needed anywhere.
//
// Loading is lazy for the reason organization.service.ts's header gives:
// organization.jobs.ts is pulled into the eager `jobs.registry.ts` barrel, and
// a static import of overview.service.ts from here would drag the whole
// analytics read path — and @openpanel/db's clients — into every core test
// file's import graph.

import { format, subDays } from 'date-fns';
import type { Logger } from '../../../logger';

/**
 * The personalized paragraph in the wind-down emails: a couple of concrete
 * facts from the org's own recent data ("your busiest day was...", "your
 * most-viewed page is...") turned into prose by a small AI call.
 *
 * The reasoning: the people this sequence targets stopped opening their
 * dashboard long ago, so deadlines alone read as noise. A specific fact they
 * didn't know — one only the product could tell them — is the reminder that
 * the thing they're about to lose actually *does* something.
 *
 * Three deliberate properties:
 * - Gated on volume. Below HIGHLIGHT_MIN_RECENT_EVENTS the "facts" are
 *   trivia ("your busiest day had 3 visitors") and would undercut the email,
 *   so low-volume orgs simply get no highlight paragraph.
 * - Never fails the email. AI throwing, or the stats queries throwing, falls
 *   back to a deterministic sentence or to nothing at all.
 * - Facts come from the org's most recently active project only. One project
 *   keeps the queries bounded and the copy concrete ("on acme-web") instead
 *   of a mush of totals across projects.
 */

export const HIGHLIGHT_MIN_RECENT_EVENTS = 1000;
const HIGHLIGHT_WINDOW_DAYS = 30;

export interface HighlightProject {
  id: string;
  name: string;
}

interface HighlightFacts {
  projectName: string;
  eventsCount: number;
  uniqueVisitors: number;
  busiestDay?: { date: string; visitors: number };
  topPage?: { path: string; sessions: number };
}

/** The `getAnalyticsOverviewCore` slice this reads — nothing more. */
export interface HighlightOverview {
  summary: { unique_visitors?: number | null };
  series: { date: string; unique_visitors: number }[];
}

/** The `getTopPagesCore` slice this reads — nothing more. */
export interface HighlightTopPage {
  path: string;
  sessions: number;
}

export interface WinBackPitchFacts {
  projectName: string;
  window: string;
  eventsCount: number;
  uniqueVisitors: number;
  busiestDay?: { date: string; visitors: number };
  topPage?: { path: string; sessions: number };
}

export interface WinBackHighlightDeps {
  logger: Logger;
  getAnalyticsOverview(input: {
    projectId: string;
    startDate: string;
    endDate: string;
    interval: 'day';
  }): Promise<HighlightOverview>;
  getTopPages(input: {
    projectId: string;
    startDate: string;
    endDate: string;
    limit: number;
  }): Promise<HighlightTopPage[]>;
  generatePitch(facts: WinBackPitchFacts): Promise<string>;
}

export async function loadWinBackHighlightDeps(
  logger: Logger
): Promise<WinBackHighlightDeps> {
  const [
    { getAnalyticsOverviewCore },
    { getTopPagesCore },
    { generateWinBackPitch },
  ] = await Promise.all([
    import('../../overview/overview.service'),
    import('../../overview/pages.service'),
    import('../../../clients/ai/win-back'),
  ]);

  return {
    logger,
    getAnalyticsOverview: (input) => getAnalyticsOverviewCore(input),
    getTopPages: (input) => getTopPagesCore(input),
    generatePitch: (facts) => generateWinBackPitch(facts),
  };
}

const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);

async function collectFacts(
  project: HighlightProject,
  recentEventsCount: number,
  deps: WinBackHighlightDeps
): Promise<HighlightFacts | null> {
  const now = new Date();
  const startDate = subDays(now, HIGHLIGHT_WINDOW_DAYS).toISOString();
  const endDate = now.toISOString();

  const [overview, topPages] = await Promise.all([
    deps.getAnalyticsOverview({
      projectId: project.id,
      startDate,
      endDate,
      interval: 'day',
    }),
    deps.getTopPages({
      projectId: project.id,
      startDate,
      endDate,
      limit: 1,
    }),
  ]);

  const uniqueVisitors = overview.summary.unique_visitors ?? 0;
  if (uniqueVisitors === 0) {
    return null;
  }

  let busiestDay: HighlightFacts['busiestDay'];
  for (const row of overview.series) {
    if (
      row.unique_visitors > 0 &&
      (!busiestDay || row.unique_visitors > busiestDay.visitors)
    ) {
      busiestDay = {
        date: format(new Date(row.date), 'MMMM d'),
        visitors: row.unique_visitors,
      };
    }
  }

  const top = topPages[0];

  return {
    projectName: project.name,
    eventsCount: recentEventsCount,
    uniqueVisitors,
    busiestDay,
    topPage: top ? { path: top.path, sessions: top.sessions } : undefined,
  };
}

/** What the reader gets when the AI is unavailable — plain but still theirs. */
function deterministicPitch(facts: HighlightFacts): string {
  const parts: string[] = [
    `In the last 30 days, ${facts.projectName} had ${formatCount(facts.uniqueVisitors)} visitors`,
  ];
  if (facts.busiestDay) {
    parts.push(
      `with its busiest day on ${facts.busiestDay.date} (${formatCount(facts.busiestDay.visitors)} visitors)`
    );
  }
  if (facts.topPage) {
    parts.push(`— ${facts.topPage.path} was the most-visited page`);
  }
  return `${parts.join(' ')}.`;
}

export async function buildWinBackHighlight(
  {
    project,
    recentEventsCount,
  }: {
    project: HighlightProject | null;
    recentEventsCount: number;
  },
  deps: WinBackHighlightDeps
): Promise<string | undefined> {
  if (!project || recentEventsCount < HIGHLIGHT_MIN_RECENT_EVENTS) {
    return undefined;
  }

  let facts: HighlightFacts | null;
  try {
    facts = await collectFacts(project, recentEventsCount, deps);
  } catch (error) {
    deps.logger.warn(
      { err: error, projectId: project.id },
      'Win-back highlight stats failed, sending without highlight'
    );
    return undefined;
  }

  if (!facts) {
    return undefined;
  }

  try {
    const pitch = await deps.generatePitch({
      projectName: facts.projectName,
      window: 'the last 30 days',
      eventsCount: facts.eventsCount,
      uniqueVisitors: facts.uniqueVisitors,
      busiestDay: facts.busiestDay,
      topPage: facts.topPage,
    });
    if (pitch.trim()) {
      return pitch.trim();
    }
  } catch (error) {
    deps.logger.warn(
      { err: error, projectId: project.id },
      'Win-back pitch AI call failed, using deterministic fallback'
    );
  }

  return deterministicPitch(facts);
}
