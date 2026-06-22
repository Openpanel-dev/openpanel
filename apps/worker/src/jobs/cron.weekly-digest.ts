import { generateWeeklyNarrative } from '@openpanel/ai';
import { db, getAnalyticsOverviewCore } from '@openpanel/db';
import { type EmailData, sendEmail } from '@openpanel/email';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'weekly-digest' });

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EVENTS = 5000;
const MAX_INSIGHTS = 5;

type DigestData = EmailData<'weekly-digest'>;
interface ProjectRow {
  id: string;
  name: string;
  organizationId: string;
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString();
}

function pctDelta(
  current: number,
  previous: number
): { delta?: string; direction: 'up' | 'down' | 'flat' } {
  if (previous <= 0) {
    return { direction: 'flat' };
  }
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const sign = pct >= 0 ? '+' : '';
  return { delta: `${sign}${pct.toFixed(0)}%`, direction };
}

function ppDelta(
  current: number,
  previous: number
): { delta?: string; direction: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  const direction = diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'flat';
  const sign = diff >= 0 ? '+' : '';
  return { delta: `${sign}${diff.toFixed(0)}pp`, direction };
}

function formatRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(startMs).toLocaleDateString('en-US', opts);
  const end = new Date(endMs).toLocaleDateString('en-US', {
    ...opts,
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

/**
 * Assemble the digest payload for one project (no sending). Returns `skipped`
 * with a reason when there's nothing worth mailing — unless `force` is set.
 */
async function buildDigestData(
  project: ProjectRow,
  opts: { force?: boolean } = {}
): Promise<{ skipped?: string; data?: DigestData }> {
  const now = Date.now();
  const curStart = now - 7 * DAY_MS;
  const prevStart = now - 14 * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString();

  const [cur, prev] = await Promise.all([
    getAnalyticsOverviewCore({
      projectId: project.id,
      startDate: iso(curStart),
      endDate: iso(now),
      interval: 'day',
    }),
    getAnalyticsOverviewCore({
      projectId: project.id,
      startDate: iso(prevStart),
      endDate: iso(curStart),
      interval: 'day',
    }),
  ]);

  const c = cur.summary;
  const p = prev.summary;

  if (!opts.force && c.unique_visitors === 0) {
    return { skipped: 'no visitors in the last 7 days' };
  }

  const stats = [
    {
      label: 'visitors',
      value: formatCount(c.unique_visitors),
      ...pctDelta(c.unique_visitors, p.unique_visitors),
    },
    {
      label: 'sessions',
      value: formatCount(c.total_sessions),
      ...pctDelta(c.total_sessions, p.total_sessions),
    },
    {
      label: 'pageviews',
      value: formatCount(c.total_screen_views),
      ...pctDelta(c.total_screen_views, p.total_screen_views),
    },
    {
      label: 'bounce rate',
      value: `${Math.round(c.bounce_rate)}%`,
      ...ppDelta(c.bounce_rate, p.bounce_rate),
    },
  ];

  const insightRows = await db.projectInsight.findMany({
    where: {
      projectId: project.id,
      state: 'active',
      emailWorthy: true,
      windowKind: { in: ['rolling_7d'] },
    },
    orderBy: [
      { relevanceScore: { sort: 'desc', nulls: 'last' } },
      { impactScore: 'desc' },
    ],
    take: MAX_INSIGHTS,
    select: { title: true, aiSummary: true, summary: true },
  });

  const insights = insightRows.map((i) => ({
    title: i.aiSummary ?? i.title,
    summary: i.summary ?? undefined,
  }));

  const dateRange = formatRange(curStart, now);

  let narrative = '';
  try {
    narrative = await generateWeeklyNarrative({
      projectName: project.name,
      dateRange,
      stats: [
        {
          label: 'visitors',
          current: c.unique_visitors,
          previous: p.unique_visitors,
        },
        {
          label: 'sessions',
          current: c.total_sessions,
          previous: p.total_sessions,
        },
        {
          label: 'pageviews',
          current: c.total_screen_views,
          previous: p.total_screen_views,
        },
        {
          label: 'bounce rate',
          current: c.bounce_rate,
          previous: p.bounce_rate,
          unit: '%',
        },
      ],
      insights,
    });
  } catch (err) {
    logger.warn({ err, projectId: project.id }, 'Narrative generation failed');
  }

  const dashboardUrl = `${process.env.DASHBOARD_URL ?? 'https://dashboard.openpanel.dev'}/${project.organizationId}/${project.id}`;

  return {
    data: {
      projectName: project.name,
      dashboardUrl,
      dateRange,
      narrative: narrative || undefined,
      stats,
      insights,
    },
  };
}

async function recipientsForOrg(organizationId: string): Promise<string[]> {
  const members = await db.member.findMany({
    where: { organizationId },
    select: { email: true },
  });
  return [...new Set(members.map((m) => m.email).filter(Boolean))];
}

/**
 * Weekly digest: per active project, week-over-week stats + the AI's
 * email-worthy insights + a generated narrative, mailed to org members.
 * `sendEmail` skips anyone unsubscribed from the `weekly_digest` category.
 */
export async function weeklyDigestCronJob() {
  // Prefilter on the raw status column (computed fields can't be used in
  // `where`), then refine with the canonical subscription state below.
  const projects = await db.project.findMany({
    where: {
      deleteAt: null,
      eventsCount: { gt: MIN_EVENTS },
      organization: { subscriptionStatus: { in: ['active', 'trialing'] } },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { subscriptionState: true } },
    },
  });

  let sent = 0;
  for (const project of projects) {
    try {
      // Single source of truth (`getSubscriptionState`): mail paid orgs and
      // live trials (the digest nudges trial→paid conversion), but skip
      // `trial_expired` — a 30-day trial that lapsed weeks ago is an abandoned
      // org we shouldn't keep emailing. `trialing` already implies the trial
      // end date is still in the future.
      const state = project.organization.subscriptionState;
      if (state !== 'active' && state !== 'trialing') {
        continue;
      }

      const { skipped, data } = await buildDigestData(project);
      if (skipped || !data) {
        continue;
      }
      const emails = await recipientsForOrg(project.organizationId);
      if (emails.length === 0) {
        continue;
      }
      for (const to of emails) {
        await sendEmail('weekly-digest', { to, data });
      }
      sent++;
    } catch (err) {
      logger.error({ err, projectId: project.id }, 'Weekly digest failed');
    }
  }

  logger.info({ projects: projects.length, sent }, 'Weekly digest complete');
}

/**
 * Debug/testing helper for a SINGLE project, bypassing eligibility.
 *   - opts.to    → send only to that address (safe for testing)
 *   - no opts.to → assemble and return the payload without sending (preview)
 *   - opts.force → build even if the project had 0 visitors this week
 */
export async function previewWeeklyDigestForProject(
  projectId: string,
  opts: { to?: string; force?: boolean } = {}
): Promise<{
  sent: boolean;
  to?: string;
  skipped?: string;
  data?: DigestData;
}> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!project) {
    return { sent: false, skipped: 'project not found' };
  }

  const { skipped, data } = await buildDigestData(project, {
    force: opts.force,
  });
  if (skipped || !data) {
    return { sent: false, skipped, data };
  }

  if (opts.to) {
    await sendEmail('weekly-digest', { to: opts.to, data });
    return { sent: true, to: opts.to, data };
  }

  return { sent: false, data };
}
