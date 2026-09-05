// Moved from packages/db/src/services/organization.service.ts +
// packages/db/src/services/delete.service.ts (M6-001, folded together per the
// module map: "delete.service in organization"). The mutation bodies inline
// in packages/trpc/src/routers/organization.ts (update/delete/cancelDeletion/
// inviteUser/revokeInvite/removeMember/updateMemberAccess) move here too, so
// V1's router and core's own organization.rpc.ts share one implementation
// (DELEGATE PATTERN). packages/db keeps a re-export shim for
// organization.service.ts: its own engine + several analytics services
// (`getSettingsForProject`) still reach it directly. packages/db loses
// delete.service.ts entirely — nothing outside apps/worker's cron job
// (now delegating here) reached it through @openpanel/db's barrel.
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).
//
// ClickHouse queries here still go through raw sqlstring-escaped strings and
// the (still-live, pre-ADR-013) `createSqlBuilder`, not the `sql` tag:
// ADR-013 converts the analytics read path one query per P7 task, and this
// module's queries haven't been converted yet.

import { DateTime } from '@openpanel/common';
import type {
  Invite,
  Prisma,
  ProjectAccess,
  User,
} from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import sqlstring from 'sqlstring';
import { sendEmail } from '../../clients/email';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps } from '../../services';
import { generateSecureId } from '../../shared/id';

export type IServiceOrganization = Awaited<
  ReturnType<typeof getOrganizationById>
>;
export type IServiceInvite = Invite;
export type IServiceMember = Prisma.MemberGetPayload<{
  include: { user: true };
}> & { access: ProjectAccess[] };
export type IServiceProjectAccess = ProjectAccess;

const DEFAULT_TIMEZONE = 'UTC';
// Grace period between a scheduled deletion and the `delete` cron sweeping it
// up — matches V1's `addHours(new Date(), 24)`.
const DELETE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
// Invite link lifetime — matches V1's `addDays(new Date(), 3)`.
const INVITE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function loadSqlBuilder() {
  return import('@openpanel/db/src/sql-builder').then(
    (m) => m.createSqlBuilder
  );
}

export async function getOrganizations(userId: string | null) {
  if (!userId) {
    return [];
  }

  const db = await loadDb();
  return db.organization.findMany({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getOrganizationById(organizationId: string) {
  const db = await loadDb();
  return db.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
  });
}

export async function getOrganizationByProjectId(projectId: string) {
  const db = await loadDb();
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId,
    },
    include: {
      organization: true,
    },
  });

  if (!project.organization) {
    return null;
  }

  return project.organization;
}

const ORGANIZATION_BY_PROJECT_CACHE_TTL_SEC = 60 * 5;
export const getOrganizationByProjectIdCached = cacheable(
  getOrganizationByProjectId,
  ORGANIZATION_BY_PROJECT_CACHE_TTL_SEC
);

export async function getInvites(organizationId: string): Promise<Invite[]> {
  const db = await loadDb();
  return db.invite.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getInviteById(inviteId: string) {
  const db = await loadDb();
  const res = await db.invite.findUnique({
    where: {
      id: inviteId,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    ...res,
    isExpired: res?.expiresAt && res.expiresAt < new Date(),
  };
}

export async function getMembers(
  organizationId: string
): Promise<IServiceMember[]> {
  const db = await loadDb();
  const [members, access] = await Promise.all([
    db.member.findMany({
      where: {
        organizationId,
        userId: {
          not: null,
        },
      },
      include: {
        user: true,
      },
    }),
    db.projectAccess.findMany({
      where: {
        organizationId,
      },
    }),
  ]);

  return members.map((member) => ({
    ...member,
    access: access.filter((a) => a.userId === member.userId),
  })) as IServiceMember[];
}

export async function getMember(organizationId: string, userId: string) {
  const db = await loadDb();
  return db.member.findFirst({
    where: {
      organizationId,
      userId,
    },
  });
}

export async function connectUserToOrganization({
  user,
  inviteId,
}: {
  user: User;
  inviteId: string;
}) {
  const db = await loadDb();
  const { getOrganizationAccess, getProjectAccess } = await import(
    '@openpanel/core'
  );

  // Use primary since before this we might have just created the invite
  // If we use replica it might not find the invite
  const invite = await db.invite.findUnique({
    where: {
      id: inviteId,
    },
  });

  if (!invite) {
    throw new Error('Invite not found');
  }

  if (process.env.ALLOW_INVITATION === 'false') {
    throw new Error('Invitations are not allowed');
  }

  if (invite.expiresAt < new Date()) {
    throw new Error('Invite expired');
  }

  // The invite might be consumed by a user who is already a member of the
  // organization (e.g. accepting it a second time). Upsert atomically against
  // the (organizationId, userId) unique constraint so concurrent consumption
  // cannot create duplicate membership rows; an existing membership is reused
  // unchanged and the invite is still consumed below.
  const member = await db.member.upsert({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      email: user.email,
      invitedById: invite.createdById,
    },
  });

  await getOrganizationAccess.clear({
    userId: user.id,
    organizationId: invite.organizationId,
  });

  if (invite.projectAccess.length > 0) {
    for (const grant of invite.projectAccess) {
      await getProjectAccess.clear({
        userId: user.id,
        projectId: grant.projectId,
      });
      await db.projectAccess.create({
        data: {
          projectId: grant.projectId,
          userId: user.id,
          organizationId: invite.organizationId,
          // The level the inviting admin chose, not a hardcoded default.
          level: grant.level,
        },
      });
    }
  }

  await db.invite.delete({
    where: {
      id: inviteId,
    },
  });

  return member;
}

/**
 * Get the total number of events during the
 * current subscription period for an organization
 */
export async function getOrganizationBillingEventsCount(
  organization: IServiceOrganization & { projects: { id: string }[] }
): Promise<number | undefined> {
  // Trials have no Polar billing period; fall back to the trial window
  // (creation → trial end). Status stays 'trialing' even once expired.
  const isTrialStatus = organization.subscriptionStatus === 'trialing';
  const periodStart =
    organization.subscriptionCurrentPeriodStart ??
    (isTrialStatus ? organization.createdAt : null);
  const periodEnd =
    organization.subscriptionCurrentPeriodEnd ??
    (isTrialStatus ? organization.subscriptionEndsAt : null);

  if (!(periodStart && periodEnd) || organization.projects.length === 0) {
    return 0;
  }

  const { chQuery, formatClickhouseDate } = await loadChClient();
  const createSqlBuilder = await loadSqlBuilder();
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.where.projectIds = `project_id IN (${organization.projects.map((project) => sqlstring.escape(project.id)).join(',')})`;
  sb.where.createdAt = `created_at BETWEEN ${sqlstring.escape(formatClickhouseDate(periodStart))} AND ${sqlstring.escape(formatClickhouseDate(periodEnd))}`;
  sb.where.names = `name NOT IN ('session_start', 'session_end')`;

  const res = await chQuery<{ count: number }>(getSql());
  return res[0]?.count;
}

// Lifetime event count for a set of projects (excluding session bookkeeping
// events). The onboarding emails use this instead of subscriptionPeriodEventsCount,
// which only refreshes when sessions end.
export async function getOrganizationEventsCount(
  projectIds: string[]
): Promise<number> {
  if (projectIds.length === 0) {
    return 0;
  }

  const { chQuery } = await loadChClient();
  const createSqlBuilder = await loadSqlBuilder();
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.where.projectIds = `project_id IN (${projectIds.map((id) => sqlstring.escape(id)).join(',')})`;
  sb.where.names = `name NOT IN ('session_start', 'session_end')`;

  const res = await chQuery<{ count: number }>(getSql());
  return res[0]?.count ?? 0;
}

// Events in a recent window, for organizations whose trial lapsed but whose
// SDKs never stopped. The lifetime count above says "you once used this"; this
// one says "you are using this right now", which is the only number that
// actually argues for a subscription.
export async function getOrganizationEventsCountSince(
  projectIds: string[],
  since: Date
): Promise<number> {
  if (projectIds.length === 0) {
    return 0;
  }

  const { chQuery, formatClickhouseDate } = await loadChClient();
  const createSqlBuilder = await loadSqlBuilder();
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.where.projectIds = `project_id IN (${projectIds.map((id) => sqlstring.escape(id)).join(',')})`;
  sb.where.names = `name NOT IN ('session_start', 'session_end')`;
  sb.where.createdAt = `created_at >= ${sqlstring.escape(formatClickhouseDate(since, true))}`;

  const res = await chQuery<{ count: number }>(getSql());
  return res[0]?.count ?? 0;
}

export async function getOrganizationBillingEventsCountSerie(
  organization: IServiceOrganization & { projects: { id: string }[] },
  {
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }
): Promise<{ count: number; day: string }[]> {
  const interval = 'day';
  const { chQuery, formatClickhouseDate } = await loadChClient();
  const createSqlBuilder = await loadSqlBuilder();
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.select.day = `toDate(toStartOf${interval.slice(0, 1).toUpperCase() + interval.slice(1)}(created_at)) AS ${interval}`;
  sb.groupBy.day = interval;
  sb.orderBy.day = `${interval} WITH FILL FROM toDate(${sqlstring.escape(formatClickhouseDate(startDate, true))}) TO toDate(${sqlstring.escape(formatClickhouseDate(endDate, true))}) STEP INTERVAL 1 ${interval.toUpperCase()}`;
  sb.where.projectIds = `project_id IN (${organization.projects.map((project) => sqlstring.escape(project.id)).join(',')})`;
  sb.where.createdAt = `${interval} BETWEEN ${sqlstring.escape(formatClickhouseDate(startDate, true))} AND ${sqlstring.escape(formatClickhouseDate(endDate, true))}`;
  sb.where.names = `name NOT IN ('session_start', 'session_end')`;

  return chQuery<{ count: number; day: string }>(getSql());
}

const BILLING_EVENTS_SERIE_CACHE_TTL_SEC = 60 * 10;
export const getOrganizationBillingEventsCountSerieCached = cacheable(
  getOrganizationBillingEventsCountSerie,
  BILLING_EVENTS_SERIE_CACHE_TTL_SEC
);

export async function getOrganizationSubscriptionChartEndDate(
  projectId: string,
  endDate: string
): Promise<string | null> {
  const organization = await getOrganizationByProjectIdCached(projectId);
  if (!organization) {
    return null;
  }
  // If the current period end date is after the subscription chart end date, we need to use the subscription chart end date
  if (
    organization.subscriptionChartEndDate &&
    new Date(endDate) > organization.subscriptionChartEndDate
  ) {
    return DateTime.fromJSDate(organization.subscriptionChartEndDate)
      .setZone(organization.timezone || DEFAULT_TIMEZONE)
      .toFormat('yyyy-MM-dd HH:mm:ss');
  }

  return endDate;
}

export async function getSettingsForOrganization(
  organizationId: string
): Promise<{ timezone: string }> {
  const db = await loadDb();
  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
  });

  return {
    timezone: organization.timezone || DEFAULT_TIMEZONE,
  };
}

export async function getSettingsForProject(
  projectId: string
): Promise<{ timezone: string }> {
  const db = await loadDb();
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId,
    },
    include: {
      organization: true,
    },
  });

  return {
    timezone: project.organization.timezone || DEFAULT_TIMEZONE,
  };
}

// --- Moved from packages/db/src/services/delete.service.ts ---

export async function deleteOrganization(organizationId: string) {
  const db = await loadDb();
  return db.organization.delete({
    where: {
      id: organizationId,
    },
  });
}

export async function deleteProjects(projectIds: string[]) {
  const db = await loadDb();
  const projects = await db.project.findMany({
    where: {
      id: {
        in: projectIds,
      },
    },
  });

  if (projects.length === 0) {
    return;
  }

  for (const project of projects) {
    await db.project.delete({
      where: {
        id: project.id,
      },
    });
  }

  return projects;
}

export async function deleteFromClickhouse(projectIds: string[]) {
  const { TABLE_NAMES, ch, getReplicatedTableName } = await loadChClient();
  const where = `project_id IN (${projectIds.map((projectId) => sqlstring.escape(projectId)).join(',')})`;
  const tables = [
    TABLE_NAMES.events,
    TABLE_NAMES.profiles,
    TABLE_NAMES.events_bots,
    TABLE_NAMES.sessions,
    TABLE_NAMES.cohort_events_mv,
    TABLE_NAMES.dau_mv,
    TABLE_NAMES.event_names_mv,
    TABLE_NAMES.event_property_values_mv,
    TABLE_NAMES.cohort_members,
    TABLE_NAMES.cohort_metadata,
    TABLE_NAMES.profile_event_summary_mv,
    TABLE_NAMES.profile_event_property_summary_mv,
    TABLE_NAMES.event_profile_summary_mv,
    TABLE_NAMES.event_property_profile_summary_mv,
  ];

  for (const table of tables) {
    // If materialized view, use ALTER TABLE since DELETE is not supported
    const query = table.endsWith('_mv')
      ? `ALTER TABLE ${getReplicatedTableName(table)} DELETE WHERE ${where};`
      : `DELETE FROM ${getReplicatedTableName(table)} WHERE ${where};`;

    await ch.command({
      query,
      clickhouse_settings: {
        lightweight_deletes_sync: '0',
      },
    });
  }
}

export interface DeleteCronResult {
  organizations: number;
  projects: number;
}

/**
 * The `delete` cron fragment's body — moved from
 * apps/worker/src/jobs/cron.delete.ts's `jobDelete` (M6-001). Finds
 * organizations scheduled for deletion or orphaned (no admin member), and
 * projects individually scheduled for deletion, then sweeps both out of
 * ClickHouse and Postgres in one pass.
 */
export async function runDeleteCron(): Promise<DeleteCronResult> {
  const db = await loadDb();
  const now = new Date();

  // Find orphaned organizations (no admin member)
  // or organizations that are scheduled for deletion
  const organizations = await db.organization.findMany({
    where: {
      OR: [
        { deleteAt: { lte: now } },
        { members: { none: { role: 'org:admin' } } },
      ],
    },
    include: { projects: { select: { id: true } } },
  });

  // Skip paying organizations
  const deletableOrganizations = organizations.filter(
    (organization) =>
      !(organization.hasSubscription && !organization.isWillBeCanceled)
  );

  // Find projects that are scheduled for deletion
  const scheduledProjects = await db.project.findMany({
    where: { deleteAt: { lte: now } },
    select: { id: true },
  });

  const projectIds = [
    ...new Set([
      ...deletableOrganizations.flatMap((organization) =>
        organization.projects.map((project) => project.id)
      ),
      ...scheduledProjects.map((project) => project.id),
    ]),
  ];

  if (projectIds.length > 0) {
    await deleteFromClickhouse(projectIds);
    await deleteProjects(projectIds);
  }

  for (const organization of deletableOrganizations) {
    await deleteOrganization(organization.id);
  }

  return {
    organizations: deletableOrganizations.length,
    projects: projectIds.length,
  };
}

// --- Moved from packages/trpc/src/routers/organization.ts's inline bodies ---

export async function updateOrganization(input: {
  id: string;
  name: string;
  timezone: string;
}) {
  const db = await loadDb();
  return db.organization.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
      timezone: input.timezone,
    },
  });
}

/**
 * Schedule the organization and all of its projects for deletion in 24
 * hours (cancelable until then). The hourly `delete` cron removes the
 * projects (and their ClickHouse events) and the organization in a single
 * pass once their `deleteAt` has passed.
 */
export async function scheduleOrganizationDeletion(
  organizationId: string
): Promise<void> {
  const db = await loadDb();
  const organization = await getOrganizationById(organizationId);

  // Require billing to be cancelled first. We don't want to delete an
  // organization that still has a live paid subscription. Once the user has
  // cancelled (the subscription is scheduled to end), deletion is allowed.
  if (organization.hasSubscription && !organization.isWillBeCanceled) {
    throw new TRPCBadRequestError(
      'Please cancel your subscription before deleting this organization.'
    );
  }

  const deleteAt = new Date(Date.now() + DELETE_GRACE_PERIOD_MS);
  await db.$transaction([
    db.project.updateMany({
      where: {
        organizationId,
      },
      data: {
        deleteAt,
      },
    }),
    db.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        deleteAt,
      },
    }),
  ]);
}

export async function cancelOrganizationDeletion(
  organizationId: string
): Promise<void> {
  const db = await loadDb();
  await db.$transaction([
    db.project.updateMany({
      where: {
        organizationId,
      },
      data: {
        deleteAt: null,
      },
    }),
    db.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        deleteAt: null,
      },
    }),
  ]);
}

export type InviteUserResult =
  | {
      type: 'is_member';
      member: Awaited<ReturnType<typeof connectUserToOrganization>>;
    }
  | {
      type: 'is_invited';
      invite: Invite & { organization: { name: string } };
    };

export async function inviteUserToOrganization(input: {
  organizationId: string;
  email: string;
  role: 'org:admin' | 'org:member';
  access: { projectId: string; level: 'read' | 'write' }[];
  invitedById: string;
}): Promise<InviteUserResult> {
  const db = await loadDb();
  const email = input.email.toLowerCase();
  const userExists = await db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  });

  const alreadyMember = await db.member.findFirst({
    where: {
      userId: userExists?.id,
      organizationId: input.organizationId,
    },
  });

  if (alreadyMember && userExists) {
    throw new TRPCBadRequestError(
      'User is already a member of the organization'
    );
  }

  const alreadyInvited = await db.invite.findFirst({
    where: {
      email,
      organizationId: input.organizationId,
    },
  });

  if (alreadyInvited) {
    throw new TRPCBadRequestError(
      'User is already invited to the organization'
    );
  }

  const invite = await db.invite.create({
    data: {
      id: generateSecureId('invite'),
      email,
      organizationId: input.organizationId,
      role: input.role,
      createdById: input.invitedById,
      projectAccess: input.access ?? [],
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    },
    include: {
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  if (userExists) {
    const member = await connectUserToOrganization({
      user: userExists,
      inviteId: invite.id,
    });

    return {
      type: 'is_member',
      member,
    };
  }

  await sendEmail('invite', {
    to: email,
    data: {
      url: `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL}/onboarding?inviteId=${invite.id}`,
      organizationName: invite.organization.name,
    },
  });

  return {
    type: 'is_invited',
    invite,
  };
}

export async function getInviteOrThrow(inviteId: string): Promise<Invite> {
  const db = await loadDb();
  return db.invite.findUniqueOrThrow({
    where: {
      id: inviteId,
    },
  });
}

export async function revokeInvite(inviteId: string): Promise<Invite> {
  const db = await loadDb();
  return db.invite.delete({
    where: {
      id: inviteId,
    },
  });
}

export async function removeOrganizationMember(input: {
  organizationId: string;
  memberId: string;
  targetUserId: string;
  requestedByUserId: string;
}): Promise<void> {
  const db = await loadDb();
  const exists = await db.member.count({
    where: {
      userId: input.targetUserId,
      organizationId: input.organizationId,
    },
  });

  if (input.requestedByUserId === input.targetUserId && exists === 1) {
    throw new Error('You cannot remove yourself from the organization');
  }

  await db.$transaction([
    db.member.delete({
      where: {
        id: input.memberId,
        userId: input.targetUserId,
        organizationId: input.organizationId,
      },
    }),
    db.projectAccess.deleteMany({
      where: {
        userId: input.targetUserId,
        organizationId: input.organizationId,
      },
    }),
  ]);
}

export async function updateOrganizationMemberAccess(input: {
  organizationId: string;
  targetUserId: string;
  access: { projectId: string; level: 'read' | 'write' }[];
}) {
  const db = await loadDb();
  return db.$transaction([
    db.projectAccess.deleteMany({
      where: {
        userId: input.targetUserId,
        organizationId: input.organizationId,
      },
    }),
    db.projectAccess.createMany({
      // The level comes from the admin's choice. This used to be hardcoded
      // to 'read', which was harmless only because nothing enforced the
      // level (GHSA-f9rx-pxgw-c6rg).
      data: input.access.map((grant) => ({
        userId: input.targetUserId,
        organizationId: input.organizationId,
        projectId: grant.projectId,
        level: grant.level,
      })),
    }),
  ]);
}

export interface OrganizationService {
  get(organizationId: string): ReturnType<typeof getOrganizationById>;
  list(userId: string | null): ReturnType<typeof getOrganizations>;
  update(input: {
    id: string;
    name: string;
    timezone: string;
  }): ReturnType<typeof updateOrganization>;
  scheduleDeletion(organizationId: string): Promise<void>;
  cancelDeletion(organizationId: string): Promise<void>;
  inviteUser(
    input: Parameters<typeof inviteUserToOrganization>[0]
  ): Promise<InviteUserResult>;
  getInviteOrThrow(inviteId: string): Promise<Invite>;
  revokeInvite(inviteId: string): Promise<Invite>;
  removeMember(
    input: Parameters<typeof removeOrganizationMember>[0]
  ): Promise<void>;
  updateMemberAccess(
    input: Parameters<typeof updateOrganizationMemberAccess>[0]
  ): ReturnType<typeof updateOrganizationMemberAccess>;
  members(organizationId: string): Promise<IServiceMember[]>;
  invitations(organizationId: string): Promise<Invite[]>;
  getInvite(inviteId: string): ReturnType<typeof getInviteById>;
  runDeleteCron(): Promise<DeleteCronResult>;
}

export function createOrganizationService(
  _deps: ServiceDeps
): OrganizationService {
  return {
    get: getOrganizationById,
    list: getOrganizations,
    update: updateOrganization,
    scheduleDeletion: scheduleOrganizationDeletion,
    cancelDeletion: cancelOrganizationDeletion,
    inviteUser: inviteUserToOrganization,
    getInviteOrThrow,
    revokeInvite,
    removeMember: removeOrganizationMember,
    updateMemberAccess: updateOrganizationMemberAccess,
    members: getMembers,
    invitations: getInvites,
    getInvite: getInviteById,
    runDeleteCron,
  };
}
