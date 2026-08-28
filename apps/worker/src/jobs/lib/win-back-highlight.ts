import { generateWinBackPitch } from '@openpanel/ai';
import { getAnalyticsOverviewCore, getTopPagesCore } from '@openpanel/db';
import { format, subDays } from 'date-fns';
import { logger } from '../../utils/logger';

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

const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);

async function collectFacts(
  project: HighlightProject,
  recentEventsCount: number,
): Promise<HighlightFacts | null> {
  const now = new Date();
  const startDate = subDays(now, HIGHLIGHT_WINDOW_DAYS).toISOString();
  const endDate = now.toISOString();

  const [overview, topPages] = await Promise.all([
    getAnalyticsOverviewCore({
      projectId: project.id,
      startDate,
      endDate,
      interval: 'day',
    }),
    getTopPagesCore({ projectId: project.id, startDate, endDate, limit: 1 }),
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
      `with its busiest day on ${facts.busiestDay.date} (${formatCount(facts.busiestDay.visitors)} visitors)`,
    );
  }
  if (facts.topPage) {
    parts.push(`— ${facts.topPage.path} was the most-visited page`);
  }
  return `${parts.join(' ')}.`;
}

export async function buildWinBackHighlight({
  project,
  recentEventsCount,
}: {
  project: HighlightProject | null;
  recentEventsCount: number;
}): Promise<string | undefined> {
  if (!project || recentEventsCount < HIGHLIGHT_MIN_RECENT_EVENTS) {
    return undefined;
  }

  let facts: HighlightFacts | null;
  try {
    facts = await collectFacts(project, recentEventsCount);
  } catch (error) {
    logger.warn(
      { err: error, projectId: project.id },
      'Win-back highlight stats failed, sending without highlight',
    );
    return undefined;
  }

  if (!facts) {
    return undefined;
  }

  try {
    const pitch = await generateWinBackPitch({
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
    logger.warn(
      { err: error, projectId: project.id },
      'Win-back pitch AI call failed, using deterministic fallback',
    );
  }

  return deterministicPitch(facts);
}
