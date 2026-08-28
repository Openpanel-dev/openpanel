import {
  db,
  getLastEventPerProject,
  getOrganizationEventsCount,
  getOrganizationEventsCountSince,
} from '@openpanel/db';
import { getRecommendedPlan } from '@openpanel/payments';
import { addDays, differenceInDays, format, subDays } from 'date-fns';
import {
  type SequenceStep,
  type SequenceSubject,
  runSequence,
  step,
} from './lib/email-sequence';
import {
  type HighlightProject,
  buildWinBackHighlight,
} from './lib/win-back-highlight';
import { logger } from '../utils/logger';

/**
 * Wind-down: what happens to a trial that expired without a purchase.
 *
 * Four emails over 44 days, then deletion. Ingestion keeps flowing until day
 * 21 so the first two emails have something to be about; from day 21 the
 * ingestion hook rejects events (see apps/api/src/hooks/subscription.hook.ts,
 * which reads `windDownStep`). Day 44 arms `deleteAt`, and the existing delete
 * cron sweeps it seven days later.
 *
 * The schedule is measured from `windDownStartedAt`, stamped when an org
 * enters. That is the whole reason the column exists: `subscriptionEndsAt` for
 * the existing backlog is hundreds of days old, so anchoring there would put
 * every one of them past day 44 on the first tick.
 *
 * The population this is really aimed at is the org whose trial lapsed months
 * ago and whose SDKs never stopped — still sending events, still costing
 * storage, never billed. Those orgs are the ones worth converting, so they
 * enter the sequence first and their emails lead with what they are currently
 * sending rather than with a lifetime total.
 */

const BLOCK_DAY = 21;
const FINAL_WARNING_DAY = 44;
const DELETE_GRACE_DAYS = 7;

/** Sent something this recently, so the SDKs are demonstrably still live. */
const STILL_TRACKING_WITHIN_DAYS = 7;
/** Window behind the "you are still sending us this much" figure. */
const RECENT_VOLUME_DAYS = 30;

/** Orgs allowed to *enter* the sequence per tick. Entry staggers the cohort. */
const DEFAULT_MAX_PER_RUN = 100;

function getMaxPerRun(): number {
  const parsed = Number.parseInt(process.env.WIND_DOWN_MAX_PER_RUN ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_PER_RUN : parsed;
}

const orgQuery = {
  include: {
    createdBy: {
      select: { id: true, email: true, firstName: true, deletedAt: true },
    },
    projects: { select: { id: true, name: true } },
  },
} as const;

type OrgWithCreator = Awaited<
  ReturnType<typeof db.organization.findMany<typeof orgQuery>>
>[number];

interface WindDownUsage {
  /** Everything ever collected — what deletion would destroy. */
  eventsCount: number;
  /** Collected in the last RECENT_VOLUME_DAYS — what blocking would stop. */
  recentEventsCount: number;
  hasData: boolean;
}

interface WindDownContext {
  org: OrgWithCreator;
  user: NonNullable<OrgWithCreator['createdBy']>;
  /** Day 0 of this org's schedule. */
  startedAt: Date;
  lastEventAt: Date | null;
  /** SDKs are still sending right now, months after the trial lapsed. */
  stillTracking: boolean;
  /** The org's most recently active project — where the highlight facts come from. */
  highlightProject: HighlightProject | null;
  getUsage: () => Promise<WindDownUsage>;
  getHighlight: () => Promise<string | undefined>;
}

// Lazy + memoized like getUsage: only still-tracking orgs that clear a day
// gate pay for the stats queries and the AI call, and each org pays once per
// tick even though two steps include the highlight.
function createHighlightGetter(ctx: {
  stillTracking: boolean;
  highlightProject: HighlightProject | null;
  getUsage: () => Promise<WindDownUsage>;
}) {
  let promise: Promise<string | undefined> | null = null;
  return () => {
    if (!ctx.stillTracking) {
      return Promise.resolve(undefined);
    }
    promise ??= ctx.getUsage().then(({ recentEventsCount }) =>
      buildWinBackHighlight({
        project: ctx.highlightProject,
        recentEventsCount,
      }),
    );
    return promise;
  };
}

function createUsageGetter(org: OrgWithCreator) {
  let promise: Promise<WindDownUsage> | null = null;
  return () => {
    const projectIds = org.projects.map((project) => project.id);
    // Only orgs that clear a day gate pay for these two ClickHouse counts, and
    // each org pays at most once per tick.
    promise ??= Promise.all([
      getOrganizationEventsCount(projectIds),
      getOrganizationEventsCountSince(
        projectIds,
        subDays(new Date(), RECENT_VOLUME_DAYS),
      ),
    ]).then(([eventsCount, recentEventsCount]) => ({
      eventsCount,
      recentEventsCount,
      hasData: eventsCount > 0,
    }));
    return promise;
  };
}

const getters = {
  firstName: (ctx: WindDownContext) => ctx.user.firstName || undefined,
  billingUrl: (ctx: WindDownContext) =>
    `${process.env.DASHBOARD_URL}/${ctx.org.id}/billing`,
  blockDate: (ctx: WindDownContext) =>
    format(addDays(ctx.startedAt, BLOCK_DAY), 'MMMM d'),
  deleteDate: (ctx: WindDownContext) =>
    format(
      addDays(ctx.startedAt, FINAL_WARNING_DAY + DELETE_GRACE_DAYS),
      'MMMM d',
    ),
  trialEndedDate: (ctx: WindDownContext) =>
    ctx.org.subscriptionEndsAt
      ? format(ctx.org.subscriptionEndsAt, 'MMMM d, yyyy')
      : undefined,
  recommendedPlan: async (ctx: WindDownContext) => {
    // Price against what they actually send now, not a lifetime total that
    // would quote a plan far bigger than they need.
    const { recentEventsCount, eventsCount } = await ctx.getUsage();
    return getRecommendedPlan(
      recentEventsCount || eventsCount,
      (plan) =>
        `${plan.formattedEvents} events per month for ${plan.formattedPrice}`,
    );
  },
} as const;

async function baseData(ctx: WindDownContext) {
  const usage = await ctx.getUsage();
  return {
    firstName: getters.firstName(ctx),
    billingUrl: getters.billingUrl(ctx),
    hasData: usage.hasData,
    eventsCount: usage.eventsCount,
    recentEventsCount: usage.recentEventsCount,
    stillTracking: ctx.stillTracking,
    projectNames: ctx.org.projects.map((project) => project.name),
  };
}

export const WIND_DOWN_STEPS: SequenceStep<WindDownContext>[] = [
  step<WindDownContext, 'wind-down-expired'>({
    day: 0,
    step: 'expired_notice',
    template: 'wind-down-expired',
    data: async (ctx) => ({
      ...(await baseData(ctx)),
      blockDate: getters.blockDate(ctx),
      trialEndedDate: getters.trialEndedDate(ctx),
      recommendedPlan: await getters.recommendedPlan(ctx),
      highlight: await ctx.getHighlight(),
    }),
  }),
  step<WindDownContext, 'wind-down-stopping-soon'>({
    day: 14,
    step: 'stopping_soon',
    template: 'wind-down-stopping-soon',
    data: async (ctx) => ({
      ...(await baseData(ctx)),
      blockDate: getters.blockDate(ctx),
      recommendedPlan: await getters.recommendedPlan(ctx),
      highlight: await ctx.getHighlight(),
    }),
  }),
  step<WindDownContext, 'wind-down-blocked'>({
    day: BLOCK_DAY,
    step: 'blocked',
    template: 'wind-down-blocked',
    // No onSent: advancing the pointer to 'blocked' *is* the block, because
    // the ingestion hook reads the pointer.
    data: async (ctx) => ({
      ...(await baseData(ctx)),
      deleteDate: getters.deleteDate(ctx),
    }),
  }),
  step<WindDownContext, 'wind-down-final-warning'>({
    day: FINAL_WARNING_DAY,
    step: 'final_warning',
    template: 'wind-down-final-warning',
    // Never arm deletion off an email that didn't go out.
    requireDelivery: true,
    onSent: async (ctx) => {
      await db.organization.update({
        where: { id: ctx.org.id },
        data: { deleteAt: addDays(new Date(), DELETE_GRACE_DAYS) },
      });
    },
    data: async (ctx) => ({
      ...(await baseData(ctx)),
      deleteDate: format(addDays(new Date(), DELETE_GRACE_DAYS), 'MMMM d'),
    }),
  }),
];

/** Newest event across all of an organization's projects. */
function lastEventFor(
  org: OrgWithCreator,
  lastEventPerProject: Map<string, Date>,
): Date | null {
  let latest: Date | null = null;
  for (const project of org.projects) {
    const seen = lastEventPerProject.get(project.id);
    if (seen && (latest === null || seen > latest)) {
      latest = seen;
    }
  }
  return latest;
}

export async function windDownCronJob() {
  if (process.env.SELF_HOSTED === 'true') {
    return null;
  }

  const now = new Date();

  // `subscriptionState` is computed and can't appear in a `where`, so prefilter
  // on the raw columns and refine below. The second arm of the OR catches orgs
  // already in the sequence, including any that have since subscribed and need
  // clearing. Note there is deliberately no filter on event volume: an org that
  // never sent anything and one still sending millions are both in scope, they
  // just get different copy and different priority.
  const candidates = await db.organization.findMany({
    where: {
      OR: [
        { windDownStartedAt: { not: null } },
        {
          AND: [
            {
              OR: [
                { subscriptionStatus: null },
                { subscriptionStatus: 'trialing' },
              ],
            },
            { subscriptionEndsAt: { lt: now } },
            { subscriptionId: null },
          ],
        },
      ],
    },
    ...orgQuery,
  });

  const expired = candidates.filter(
    (org) => org.subscriptionState === 'trial_expired',
  );

  // Recovered: subscribed (or otherwise left trial_expired) while in the
  // sequence. The Polar webhook clears these on the spot; this is the
  // belt-and-braces pass for a webhook we never received.
  const recovered = candidates.filter(
    (org) =>
      org.windDownStartedAt !== null &&
      org.subscriptionState !== 'trial_expired',
  );

  if (recovered.length > 0) {
    await db.organization.updateMany({
      where: { id: { in: recovered.map((org) => org.id) } },
      data: { windDownStartedAt: null, windDownStep: null, deleteAt: null },
    });
  }

  // Without a creator we have nobody to warn, so the sequence can't run. Such
  // orgs are left alone; the delete cron already sweeps ones with no admin.
  const contactable = expired.filter(
    (org) => org.createdBy && !org.createdBy.deletedAt,
  );

  // One cheap aggregate for the whole instance, same source the data-health
  // job uses. It answers "are the SDKs still live", which decides both the
  // copy and who gets in first.
  const lastEventPerProject = await getLastEventPerProject();
  const stillTrackingCutoff = subDays(now, STILL_TRACKING_WITHIN_DAYS);

  const activity = new Map<string, { lastEventAt: Date | null; still: boolean }>(
    contactable.map((org) => {
      const lastEventAt = lastEventFor(org, lastEventPerProject);
      return [
        org.id,
        {
          lastEventAt,
          still: lastEventAt !== null && lastEventAt > stillTrackingCutoff,
        },
      ];
    }),
  );

  // Orgs still sending go first: they are the ones there is anything to
  // convert, and letting them lead means their response is visible before the
  // long dormant tail enters.
  const entering = contactable
    .filter((org) => org.windDownStartedAt === null)
    .sort((a, b) => {
      const left = activity.get(a.id);
      const right = activity.get(b.id);
      if (left?.still !== right?.still) {
        return left?.still ? -1 : 1;
      }
      return (
        (right?.lastEventAt?.getTime() ?? 0) -
        (left?.lastEventAt?.getTime() ?? 0)
      );
    })
    .slice(0, getMaxPerRun());

  if (entering.length > 0) {
    await db.organization.updateMany({
      where: { id: { in: entering.map((org) => org.id) } },
      data: { windDownStartedAt: now },
    });
  }

  const enteringIds = new Set(entering.map((org) => org.id));
  const active = contactable.filter(
    (org) => org.windDownStartedAt !== null || enteringIds.has(org.id),
  );

  const subjects: SequenceSubject<WindDownContext>[] = active.map((org) => {
    const user = org.createdBy as NonNullable<OrgWithCreator['createdBy']>;
    const startedAt = org.windDownStartedAt ?? now;
    const seen = activity.get(org.id);

    // Most recently active project carries the highlight facts.
    let highlightProject: HighlightProject | null = null;
    let highlightSeen: Date | null = null;
    for (const project of org.projects) {
      const projectSeen = lastEventPerProject.get(project.id);
      if (projectSeen && (!highlightSeen || projectSeen > highlightSeen)) {
        highlightSeen = projectSeen;
        highlightProject = project;
      }
    }

    const getUsage = createUsageGetter(org);
    const stillTracking = seen?.still ?? false;
    return {
      id: org.id,
      email: user.email,
      anchor: startedAt,
      pointer: org.windDownStep,
      ctx: {
        org,
        user,
        startedAt,
        lastEventAt: seen?.lastEventAt ?? null,
        stillTracking,
        highlightProject,
        getUsage,
        getHighlight: createHighlightGetter({
          stillTracking,
          highlightProject,
          getUsage,
        }),
      },
    };
  });

  const result = await runSequence({
    name: 'wind-down',
    steps: WIND_DOWN_STEPS,
    subjects,
    logger,
    onAdvance: async (subject, stepName) => {
      await db.organization.update({
        where: { id: subject.id },
        data: { windDownStep: stepName },
      });
    },
    // No onComplete on purpose: the final pointer has to stay put, because
    // the ingestion hook reads it. Marking the sequence 'completed' would
    // unblock an org that is on its way to deletion.
  });

  const stillTrackingCount = [...activity.values()].filter(
    (entry) => entry.still,
  ).length;

  logger.info(
    {
      candidates: candidates.length,
      expired: expired.length,
      recovered: recovered.length,
      entering: entering.length,
      stillTracking: stillTrackingCount,
      ...result,
    },
    'Wind-down cron complete',
  );

  return {
    expired: expired.length,
    recovered: recovered.length,
    entering: entering.length,
    stillTracking: stillTrackingCount,
    ...result,
  };
}

/** Days into the sequence, for logging and the debug route. */
export function windDownDay(org: {
  windDownStartedAt: Date | null;
}): number | null {
  return org.windDownStartedAt
    ? differenceInDays(new Date(), org.windDownStartedAt)
    : null;
}
