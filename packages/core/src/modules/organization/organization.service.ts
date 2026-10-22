// `cacheable` keys on the call's arguments, so the caller's deps travel beside
// the key rather than inside it, or the Redis key would change per request.

import { sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  AccessLevel,
  Invite,
  Prisma,
  User,
} from '@openpanel/db/src/prisma-client';
import { DateTime, generateSecureId } from '@openpanel/shared';
import {
  cacheablePerDb,
  cacheablePerDeps,
  type DbScope,
} from '../../cacheable-per-deps';
import { chQuery } from '../../ch-query';
import { sendEmail } from '../../clients/email';
import { TRPCBadRequestError, TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import {
  effectiveProjectGrants,
  getOrganizationAccess,
  getProjectAccess,
} from '../../shared/access-lookups';
import { formatClickhouseDate } from '../../shared/ch-dates';
import { replicatedTarget, TABLE_NAMES } from '../../shared/ch-tables';
import {
  DEFAULT_TIMEZONE,
  type InvitableRole,
  type IProjectAccessGrant,
  isValidTimezone,
  normalizeOrganizationRole,
  type OrganizationRole,
  type ProjectScope,
  resolveOrganizationRole,
  STORED_ADMIN_ROLES,
  toStoredOrganizationRole,
} from './organization.constants';

export type IServiceOrganization = Awaited<
  ReturnType<typeof getOrganizationById>
>;
export type IServiceInvite = Omit<Invite, 'role'> & { role: OrganizationRole };
export type IServiceMember = Omit<
  Prisma.MemberGetPayload<{ include: { user: true } }>,
  'role' | 'projectScope'
> & {
  role: OrganizationRole;
  projectScope: ProjectScope;
  projects: { projectId: string; level: AccessLevel | null }[];
};

// Session bookkeeping rows are worker-generated (the reaper can emit
// session_end long after tracking stopped), so they are not billable activity.
const NON_BILLABLE_EVENT_NAMES = ['session_start', 'session_end'];

const DELETE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const INVITE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

export async function getOrganizations(
  deps: ServiceDeps,
  userId: string | null
) {
  if (!userId) {
    return [];
  }

  const db = deps.db;
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

export async function getOrganizationById(
  deps: ServiceDeps,
  organizationId: string
) {
  const db = deps.db;
  return db.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
  });
}

export async function getOrganizationByProjectId(
  deps: DbScope,
  projectId: string
) {
  const db = deps.db;
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
// Per process, not per request: ingest reads it on every event.
export const getOrganizationByProjectIdCached = cacheablePerDb(
  'getOrganizationByProjectId',
  (deps: DbScope, projectId: string) =>
    getOrganizationByProjectId(deps, projectId),
  ORGANIZATION_BY_PROJECT_CACHE_TTL_SEC
);

export async function getInvites(
  deps: ServiceDeps,
  organizationId: string
): Promise<IServiceInvite[]> {
  const db = deps.db;
  const invites = await db.invite.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return invites.map((invite) => ({
    ...invite,
    role: normalizeOrganizationRole(invite.role),
  }));
}

export async function getInviteById(deps: ServiceDeps, inviteId: string) {
  const db = deps.db;
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

  // Spreading a null result gave `{isExpired: undefined}`, a truthy object, so
  // the onboarding page showed an invitation banner for a bogus id.
  if (!res) {
    throw new TRPCNotFoundError('Invite not found');
  }

  return {
    ...res,
    isExpired: res.expiresAt < new Date(),
  };
}

export async function getMembers(
  deps: ServiceDeps,
  organizationId: string
): Promise<IServiceMember[]> {
  const db = deps.db;
  const [members, legacyGrants] = await Promise.all([
    db.member.findMany({
      where: {
        organizationId,
        userId: {
          not: null,
        },
      },
      include: {
        user: true,
        projects: { select: { projectId: true, level: true } },
        organization: { select: { createdByUserId: true } },
      },
    }),
    db.projectAccess.findMany({
      where: { organizationId },
      select: { userId: true, projectId: true, level: true },
    }),
  ]);

  // The same projection the access lookup applies, so the edit modal never
  // starts from "all projects" for a member an old pod restricted.
  return members.map(({ organization, ...member }) => ({
    ...member,
    ...effectiveProjectGrants({
      projectScope: member.projectScope,
      projects: member.projects,
      legacyGrants: legacyGrants.filter(
        (grant) => grant.userId === member.userId
      ),
    }),
    role: resolveOrganizationRole({ ...member, organization }),
  }));
}

/**
 * Write a member's project grants to both tables. `project_access` is the
 * previous build's source of truth and is kept in step for one more build so
 * a rollback changes nobody's access; the next build drops it.
 */
function writeMemberProjects(
  deps: ServiceDeps,
  member: { id: string; userId: string; organizationId: string },
  projectScope: ProjectScope,
  grants: IProjectAccessGrant[]
) {
  const db = deps.db;
  const selected = projectScope === 'all' ? [] : grants;
  return [
    db.member.update({
      where: { id: member.id },
      data: { projectScope },
    }),
    db.memberProject.deleteMany({ where: { memberId: member.id } }),
    db.memberProject.createMany({
      data: selected.map((grant) => ({
        memberId: member.id,
        projectId: grant.projectId,
        // Write is what the role gives; only a restriction is worth storing.
        level: grant.level === 'read' ? 'read' : null,
      })),
    }),
    db.projectAccess.deleteMany({
      where: { userId: member.userId, organizationId: member.organizationId },
    }),
    db.projectAccess.createMany({
      data: selected.map((grant) => ({
        userId: member.userId,
        organizationId: member.organizationId,
        projectId: grant.projectId,
        level: grant.level,
      })),
    }),
  ];
}

/**
 * The access lookups cache a granted answer for minutes, so every change to a
 * membership or its project grants must drop that user's entries for every
 * project of the organization. A grant on one project also revokes the
 * implicit org-wide default on all the others. Call it after the write, or a
 * concurrent request can cache the old answer again.
 */
async function clearMemberAccessCache(
  deps: ServiceDeps,
  { userId, organizationId }: { userId: string; organizationId: string }
): Promise<void> {
  const projects = await deps.db.project.findMany({
    where: { organizationId },
    select: { id: true },
  });
  await Promise.all([
    getOrganizationAccess.clear({ userId, organizationId }),
    ...projects.map((project) =>
      getProjectAccess.clear({ userId, projectId: project.id })
    ),
  ]);
}

export async function connectUserToOrganization(
  deps: ServiceDeps,
  {
    user,
    inviteId,
  }: {
    user: User;
    inviteId: string;
  }
) {
  const db = deps.db;

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

  if (deps.config.auth.allowInvitation === false) {
    throw new Error('Invitations are not allowed');
  }

  if (invite.expiresAt < new Date()) {
    throw new Error('Invite expired');
  }

  // Invites written before the scope column, or by the previous image during
  // a rolling deploy, carry their restriction only in `projectAccess`.
  const projectScope: ProjectScope =
    invite.projectAccess.length > 0 ? 'selected' : invite.projectScope;

  const existing = await db.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
  });

  // The invite might be consumed by a user who is already a member of the
  // organization (e.g. accepting it a second time). Upsert atomically against
  // the (organizationId, userId) unique constraint so concurrent consumption
  // cannot create duplicate membership rows; an existing membership is reused
  // unchanged, grants included, and the invite is still consumed below.
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
      projectScope,
    },
  });

  if (!existing) {
    await db.$transaction(
      writeMemberProjects(
        deps,
        {
          id: member.id,
          userId: user.id,
          organizationId: invite.organizationId,
        },
        projectScope,
        invite.projectAccess
      )
    );
  }

  await clearMemberAccessCache(deps, {
    userId: user.id,
    organizationId: invite.organizationId,
  });

  await db.invite.delete({
    where: {
      id: inviteId,
    },
  });

  return member;
}

export async function getOrganizationBillingEventsCount(
  deps: ServiceDeps,
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

  const statement = sql`
    SELECT COUNT(*) AS count
    FROM ${sql.id(TABLE_NAMES.events)} e
    WHERE project_id IN ${sql.array(
      'String',
      organization.projects.map((project) => project.id)
    )}
      AND created_at BETWEEN ${sql.string(formatClickhouseDate(periodStart))} AND ${sql.string(formatClickhouseDate(periodEnd))}
      AND name NOT IN ${sql.array('String', NON_BILLABLE_EVENT_NAMES)}
  `;

  const res = await chQuery<{ count: number }>(deps, statement);
  return res[0]?.count;
}

// Lifetime event count for a set of projects (excluding session bookkeeping
// events). The onboarding emails use this instead of subscriptionPeriodEventsCount,
// which only refreshes when sessions end.
export async function getOrganizationEventsCount(
  deps: ServiceDeps,
  projectIds: string[]
): Promise<number> {
  if (projectIds.length === 0) {
    return 0;
  }

  const statement = sql`
    SELECT COUNT(*) AS count
    FROM ${sql.id(TABLE_NAMES.events)} e
    WHERE project_id IN ${sql.array('String', projectIds)}
      AND name NOT IN ${sql.array('String', NON_BILLABLE_EVENT_NAMES)}
  `;

  const res = await chQuery<{ count: number }>(deps, statement);
  return res[0]?.count ?? 0;
}

// Events in a recent window, for organizations whose trial lapsed but whose
// SDKs never stopped. The lifetime count above says "you once used this"; this
// one says "you are using this right now", which is the only number that
// actually argues for a subscription.
export async function getOrganizationEventsCountSince(
  deps: ServiceDeps,
  projectIds: string[],
  since: Date
): Promise<number> {
  if (projectIds.length === 0) {
    return 0;
  }

  const statement = sql`
    SELECT COUNT(*) AS count
    FROM ${sql.id(TABLE_NAMES.events)} e
    WHERE project_id IN ${sql.array('String', projectIds)}
      AND name NOT IN ${sql.array('String', NON_BILLABLE_EVENT_NAMES)}
      AND created_at >= ${sql.string(formatClickhouseDate(since, true))}
  `;

  const res = await chQuery<{ count: number }>(deps, statement);
  return res[0]?.count ?? 0;
}

export interface IOrganizationBillingUsageInput {
  projectIds: string[];
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  to: string;
}

export interface IOrganizationBillingUsage {
  from: string;
  to: string;
  /** One row per UTC day in the window, zero-filled; `counts` is keyed by project id. */
  days: { day: string; counts: Record<string, number> }[];
  /** Billable events per project over the window. */
  projectTotals: Record<string, number>;
  /** The most frequent billable event names over the window, descending. */
  eventNames: { name: string; count: number }[];
}

// Enough slices for a legible pie; the dashboard folds the rest into "Other".
export const BILLING_USAGE_EVENT_NAMES_LIMIT = 9;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function listUtcDays(from: string, to: string): string[] {
  const days: string[] = [];
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  for (
    let cursor = new Date(`${from}T00:00:00.000Z`).getTime();
    cursor <= end;
    cursor += MS_PER_DAY
  ) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

export async function getOrganizationBillingUsage(
  deps: ServiceDeps,
  { projectIds, from, to }: IOrganizationBillingUsageInput
): Promise<IOrganizationBillingUsage> {
  const empty: IOrganizationBillingUsage = {
    from,
    to,
    days: listUtcDays(from, to).map((day) => ({ day, counts: {} })),
    projectTotals: {},
    eventNames: [],
  };
  if (projectIds.length === 0) {
    return empty;
  }

  // Both statements share the billable-event filter so the pie's "Other"
  // slice (total minus the named slices) adds up against the bars.
  const billable = sql`
    project_id IN ${sql.array('String', projectIds)}
      AND toDate(created_at) BETWEEN toDate(${sql.string(from)}) AND toDate(${sql.string(to)})
      AND name NOT IN ${sql.array('String', NON_BILLABLE_EVENT_NAMES)}
  `;
  const [perProjectDay, perName] = await Promise.all([
    chQuery<{ project_id: string; day: string; count: number }>(
      deps,
      sql`
        SELECT project_id, toDate(created_at) AS day, COUNT(*) AS count
        FROM ${sql.id(TABLE_NAMES.events)}
        WHERE ${billable}
        GROUP BY project_id, day
      `
    ),
    chQuery<{ name: string; count: number }>(
      deps,
      sql`
        SELECT name, COUNT(*) AS count
        FROM ${sql.id(TABLE_NAMES.events)}
        WHERE ${billable}
        GROUP BY name
        ORDER BY count DESC
        LIMIT ${sql.uint64(BILLING_USAGE_EVENT_NAMES_LIMIT)}
      `
    ),
  ]);

  const countsByDay = new Map(empty.days.map((row) => [row.day, row.counts]));
  for (const row of perProjectDay) {
    const count = Number(row.count);
    countsByDay.get(row.day)![row.project_id] = count;
    empty.projectTotals[row.project_id] =
      (empty.projectTotals[row.project_id] ?? 0) + count;
  }
  empty.eventNames = perName.map((row) => ({
    name: row.name,
    count: Number(row.count),
  }));
  return empty;
}

const BILLING_USAGE_CACHE_TTL_SEC = 60 * 10;
export const getOrganizationBillingUsageCached = cacheablePerDeps(
  'getOrganizationBillingUsage',
  (deps: ServiceDeps, input: IOrganizationBillingUsageInput) =>
    getOrganizationBillingUsage(deps, input),
  BILLING_USAGE_CACHE_TTL_SEC
);

export async function getOrganizationSubscriptionChartEndDate(
  deps: ServiceDeps,
  projectId: string,
  endDate: string
): Promise<string | null> {
  const organization = await getOrganizationByProjectIdCached(deps, projectId);
  if (!organization) {
    return null;
  }
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
  deps: ServiceDeps,
  organizationId: string
): Promise<{ timezone: string }> {
  const db = deps.db;
  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
  });

  return {
    timezone: resolveTimezone(deps, organization.id, organization.timezone),
  };
}

// One bad stored zone must not take the whole organization down.
function resolveTimezone(
  deps: ServiceDeps,
  organizationId: string,
  stored: string | null
): string {
  if (!stored) {
    return DEFAULT_TIMEZONE;
  }
  if (isValidTimezone(stored)) {
    return stored;
  }
  deps.logger.warn(
    { organizationId, timezone: stored },
    'organization has an invalid timezone; using UTC'
  );
  return DEFAULT_TIMEZONE;
}

export async function getSettingsForProject(
  deps: ServiceDeps,
  projectId: string
): Promise<{ timezone: string }> {
  const db = deps.db;
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId,
    },
    include: {
      organization: true,
    },
  });

  return {
    timezone: resolveTimezone(
      deps,
      project.organization.id,
      project.organization.timezone
    ),
  };
}

export async function deleteOrganization(
  deps: ServiceDeps,
  organizationId: string
) {
  const db = deps.db;
  return db.organization.delete({
    where: {
      id: organizationId,
    },
  });
}

export async function deleteProjects(deps: ServiceDeps, projectIds: string[]) {
  const db = deps.db;
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

  await db.project.deleteMany({
    where: {
      id: {
        in: projects.map((project) => project.id),
      },
    },
  });

  return projects;
}

export async function deleteFromClickhouse(
  deps: ServiceDeps,
  projectIds: string[]
) {
  const ch = deps.ch;
  const where = sql`project_id IN ${sql.array('String', projectIds)}`;
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
    TABLE_NAMES.event_profile_summary_mv,
    TABLE_NAMES.event_property_profile_summary_mv,
  ];

  for (const table of tables) {
    const target = replicatedTarget(deps.config.clickhouseClustered, table);
    // If materialized view, use ALTER TABLE since DELETE is not supported
    const statement = table.endsWith('_mv')
      ? sql`ALTER TABLE ${target} DELETE WHERE ${where};`
      : sql`DELETE FROM ${target} WHERE ${where};`;

    const { query, query_params } = statement.toStatement();
    await ch.command({
      query,
      query_params,
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
 * Finds organizations scheduled for deletion or orphaned (no admin member),
 * and projects individually scheduled for deletion, then sweeps both out of
 * ClickHouse and Postgres in one pass.
 */
export async function runDeleteCron(
  deps: ServiceDeps
): Promise<DeleteCronResult> {
  const db = deps.db;
  const now = new Date();

  const organizations = await db.organization.findMany({
    where: {
      OR: [
        { deleteAt: { lte: now } },
        { members: { none: { role: { in: [...STORED_ADMIN_ROLES] } } } },
      ],
    },
    include: { projects: { select: { id: true } } },
  });

  // Skip paying organizations
  const deletableOrganizations = organizations.filter(
    (organization) =>
      !(organization.hasSubscription && !organization.isWillBeCanceled)
  );

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
    await deleteFromClickhouse(deps, projectIds);
    await deleteProjects(deps, projectIds);
  }

  for (const organization of deletableOrganizations) {
    await deleteOrganization(deps, organization.id);
  }

  return {
    organizations: deletableOrganizations.length,
    projects: projectIds.length,
  };
}

export async function updateOrganization(
  deps: ServiceDeps,
  input: {
    id: string;
    name: string;
    timezone: string;
  }
) {
  const db = deps.db;
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
  deps: ServiceDeps,
  organizationId: string
): Promise<void> {
  const db = deps.db;
  const organization = await getOrganizationById(deps, organizationId);

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
  deps: ServiceDeps,
  organizationId: string
): Promise<void> {
  const db = deps.db;
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

export async function inviteUserToOrganization(
  deps: ServiceDeps,
  input: {
    organizationId: string;
    email: string;
    role: InvitableRole;
    projectScope: ProjectScope;
    access: IProjectAccessGrant[];
    invitedById: string;
  }
): Promise<InviteUserResult> {
  const db = deps.db;
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

  const access = input.projectScope === 'all' ? [] : input.access;
  await assertProjectsInOrganization(deps, input.organizationId, access);

  const invite = await db.invite.create({
    data: {
      id: generateSecureId('invite'),
      email,
      organizationId: input.organizationId,
      role: toStoredOrganizationRole(input.role),
      createdById: input.invitedById,
      projectScope: input.projectScope,
      projectAccess: access,
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
    const member = await connectUserToOrganization(deps, {
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
      url: `${deps.config.dashboardUrl}/onboarding?inviteId=${invite.id}`,
      organizationName: invite.organization.name,
    },
  });

  return {
    type: 'is_invited',
    invite,
  };
}

export async function getInviteOrThrow(
  deps: ServiceDeps,
  inviteId: string
): Promise<Invite> {
  const db = deps.db;
  return db.invite.findUniqueOrThrow({
    where: {
      id: inviteId,
    },
  });
}

export async function revokeInvite(
  deps: ServiceDeps,
  inviteId: string
): Promise<Invite> {
  const db = deps.db;
  return db.invite.delete({
    where: {
      id: inviteId,
    },
  });
}

export async function removeOrganizationMember(
  deps: ServiceDeps,
  input: {
    organizationId: string;
    memberId: string;
    targetUserId: string;
    requestedByUserId: string;
  }
): Promise<void> {
  const db = deps.db;
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
  await clearMemberAccessCache(deps, {
    userId: input.targetUserId,
    organizationId: input.organizationId,
  });
}

/**
 * A grant may only name a project inside the organization it is granted in.
 * Without this an admin of one organization could write projectAccess rows
 * pointing at another organization's projects.
 */
async function assertProjectsInOrganization(
  deps: ServiceDeps,
  organizationId: string,
  access: { projectId: string }[]
) {
  const projectIds = [...new Set(access.map((grant) => grant.projectId))];
  if (projectIds.length === 0) {
    return;
  }
  const found = await deps.db.project.findMany({
    where: { id: { in: projectIds }, organizationId },
    select: { id: true },
  });
  if (found.length !== projectIds.length) {
    const known = new Set(found.map((project) => project.id));
    const unknown = projectIds.filter((id) => !known.has(id));
    throw new TRPCBadRequestError(
      `Project not in this organization: ${unknown.join(', ')}`
    );
  }
}

export async function updateOrganizationMemberAccess(
  deps: ServiceDeps,
  input: {
    organizationId: string;
    targetUserId: string;
    projectScope: ProjectScope;
    access: IProjectAccessGrant[];
  }
): Promise<void> {
  const db = deps.db;

  // The rows below are keyed on a user this never confirmed was a member, so
  // an unknown id silently produced access rows for a non-member.
  const member = await db.member.findFirst({
    where: {
      userId: input.targetUserId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });
  if (!member) {
    throw new TRPCNotFoundError('User is not a member of this organization');
  }
  const access = input.projectScope === 'all' ? [] : input.access;
  await assertProjectsInOrganization(deps, input.organizationId, access);

  await db.$transaction(
    writeMemberProjects(
      deps,
      {
        id: member.id,
        userId: input.targetUserId,
        organizationId: input.organizationId,
      },
      input.projectScope,
      access
    )
  );
  await clearMemberAccessCache(deps, {
    userId: input.targetUserId,
    organizationId: input.organizationId,
  });
}

export function createOrganizationService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    get: (organizationId: string): ReturnType<typeof getOrganizationById> =>
      getOrganizationById(deps, organizationId),
    list: (userId: string | null): ReturnType<typeof getOrganizations> =>
      getOrganizations(deps, userId),
    update: (input: {
      id: string;
      name: string;
      timezone: string;
    }): ReturnType<typeof updateOrganization> =>
      updateOrganization(deps, input),
    scheduleDeletion: (organizationId: string): Promise<void> =>
      scheduleOrganizationDeletion(deps, organizationId),
    cancelDeletion: (organizationId: string): Promise<void> =>
      cancelOrganizationDeletion(deps, organizationId),
    inviteUser: (
      input: Parameters<typeof inviteUserToOrganization>[1]
    ): Promise<InviteUserResult> => inviteUserToOrganization(deps, input),
    getInviteOrThrow: (inviteId: string): Promise<Invite> =>
      getInviteOrThrow(deps, inviteId),
    revokeInvite: (inviteId: string): Promise<Invite> =>
      revokeInvite(deps, inviteId),
    removeMember: (
      input: Parameters<typeof removeOrganizationMember>[1]
    ): Promise<void> => removeOrganizationMember(deps, input),
    updateMemberAccess: (
      input: Parameters<typeof updateOrganizationMemberAccess>[1]
    ): Promise<void> => updateOrganizationMemberAccess(deps, input),
    members: (organizationId: string): Promise<IServiceMember[]> =>
      getMembers(deps, organizationId),
    invitations: (organizationId: string): Promise<IServiceInvite[]> =>
      getInvites(deps, organizationId),
    getInvite: (inviteId: string): ReturnType<typeof getInviteById> =>
      getInviteById(deps, inviteId),
    runDeleteCron: (): Promise<DeleteCronResult> => runDeleteCron(deps),
  };
}
