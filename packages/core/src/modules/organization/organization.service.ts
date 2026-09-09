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
// M10-009: every exported function takes `ServiceDeps` and reaches Postgres
// as `deps.db` and ClickHouse as `deps.ch` (through core's own `chQuery`), so
// the requestId minted at the edge reaches the query (ADR-018,
// docs/TECH_DEBT.md §4). The three `cacheable` wrappers are the exception:
// `cacheable` keys on the call's ARGUMENTS (packages/redis/cachable.ts), so
// `deps` cannot be a leading parameter and they reach the boot scope through
// the declared v1-compat seam instead.
//
// M12-006 also made `shared/access-lookups.ts` a static import: that file
// value-imports only zod-free leaves (`@openpanel/redis`, a Prisma TYPE) and
// reaches Postgres through the lazy v1-compat seam itself, so it has no static
// edge back here and the dynamic form deferred nothing (ADR-007: no lazy
// loaders).
//
// M12-006 converted all five ClickHouse statements here onto the ADR-013 `sql`
// tag: the four billing counters and `deleteFromClickhouse`'s project filter
// bind every value as a `{pN:Type}` param, and the statements are written out
// in full instead of assembled by `createSqlBuilder`'s record-of-strings.
// `sqlstring` and `createSqlBuilder` are both gone from this module. The
// `sql` tag is a value import of `@openpanel/db` and stays one: it is a
// compile-time template tag holding no client (see shared/ch-query.ts). The
// V1-vs-V2 result-set proof is `organization.sql.proof.md` beside this file.

import { sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  Invite,
  Prisma,
  ProjectAccess,
  User,
} from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import { sendEmail } from '../../clients/email';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import {
  getOrganizationAccess,
  getProjectAccess,
} from '../../shared/access-lookups';
import { formatClickhouseDate } from '../../shared/ch-dates';
import { chQuery } from '../../shared/ch-query';
import { isClickhouseClustered, TABLE_NAMES } from '../../shared/ch-tables';
import { DateTime } from '../../shared/date';
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
// Session bookkeeping rows are worker-generated (the reaper can emit
// session_end long after tracking stopped), so they are not billable activity.
// V1 wrote this list inline as SQL text in all four counters below.
const NON_BILLABLE_EVENT_NAMES = ['session_start', 'session_end'];
/** A module function's parameters with its leading `ServiceDeps` dropped. */
type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest]
  ? Rest
  : never;

const DELETE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
// Invite link lifetime — matches V1's `addDays(new Date(), 3)`.
const INVITE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

/** The three `cacheable` wrappers below cannot carry `ServiceDeps` — see the
 *  header. GENUINE CYCLE, kept lazy: services.ts -> organization.service.ts
 *  (this file) -> v1-compat.ts -> services.ts. */
function loadCompatServiceDeps() {
  return import('../../v1-compat').then((m) => m.compatServiceDeps());
}

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
  deps: ServiceDeps,
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
export const getOrganizationByProjectIdCached = cacheable(
  'getOrganizationByProjectId',
  async (projectId: string) =>
    getOrganizationByProjectId(await loadCompatServiceDeps(), projectId),
  ORGANIZATION_BY_PROJECT_CACHE_TTL_SEC
);

export async function getInvites(
  deps: ServiceDeps,
  organizationId: string
): Promise<Invite[]> {
  const db = deps.db;
  return db.invite.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
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

  return {
    ...res,
    isExpired: res?.expiresAt && res.expiresAt < new Date(),
  };
}

export async function getMembers(
  deps: ServiceDeps,
  organizationId: string
): Promise<IServiceMember[]> {
  const db = deps.db;
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

export async function getMember(
  deps: ServiceDeps,
  organizationId: string,
  userId: string
) {
  const db = deps.db;
  return db.member.findFirst({
    where: {
      organizationId,
      userId,
    },
  });
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

export async function getOrganizationBillingEventsCountSerie(
  deps: ServiceDeps,
  organization: IServiceOrganization & { projects: { id: string }[] },
  {
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }
): Promise<{ count: number; day: string }[]> {
  // V1 built this through a `const interval = 'day'` that was never anything
  // but 'day'; the fragment writes the bucket out instead of deriving four
  // spellings of it. `day` is the SELECT alias, referenced by the WHERE and
  // the WITH FILL exactly as V1 referenced it.
  const from = formatClickhouseDate(startDate, true);
  const to = formatClickhouseDate(endDate, true);
  const statement = sql`
    SELECT COUNT(*) AS count, toDate(toStartOfDay(created_at)) AS day
    FROM ${sql.id(TABLE_NAMES.events)} e
    WHERE project_id IN ${sql.array(
      'String',
      organization.projects.map((project) => project.id)
    )}
      AND day BETWEEN ${sql.string(from)} AND ${sql.string(to)}
      AND name NOT IN ${sql.array('String', NON_BILLABLE_EVENT_NAMES)}
    GROUP BY day
    ORDER BY day WITH FILL FROM toDate(${sql.string(from)}) TO toDate(${sql.string(to)}) STEP INTERVAL 1 DAY
  `;

  return chQuery<{ count: number; day: string }>(deps, statement);
}

const BILLING_EVENTS_SERIE_CACHE_TTL_SEC = 60 * 10;
export const getOrganizationBillingEventsCountSerieCached = cacheable(
  'getOrganizationBillingEventsCountSerie',
  async (
    ...args: Tail<Parameters<typeof getOrganizationBillingEventsCountSerie>>
  ) =>
    getOrganizationBillingEventsCountSerie(
      await loadCompatServiceDeps(),
      ...args
    ),
  BILLING_EVENTS_SERIE_CACHE_TTL_SEC
);

export async function getOrganizationSubscriptionChartEndDate(
  deps: ServiceDeps,
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
    timezone: organization.timezone || DEFAULT_TIMEZONE,
  };
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
    timezone: project.organization.timezone || DEFAULT_TIMEZONE,
  };
}

// --- Moved from packages/db/src/services/delete.service.ts ---

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

  for (const project of projects) {
    await db.project.delete({
      where: {
        id: project.id,
      },
    });
  }

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
    TABLE_NAMES.profile_event_summary_mv,
    TABLE_NAMES.profile_event_property_summary_mv,
    TABLE_NAMES.event_profile_summary_mv,
    TABLE_NAMES.event_property_profile_summary_mv,
  ];

  for (const table of tables) {
    // `getReplicatedTableName` appends `ON CLUSTER '{cluster}'` in clustered
    // mode, which is a clause rather than an identifier — so the table name
    // goes through `sql.id` and the clause stays literal template text.
    const target = isClickhouseClustered()
      ? sql`${sql.id(`${table}_replicated`)} ON CLUSTER '{cluster}'`
      : sql.id(table);
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
 * The `delete` cron fragment's body — moved from
 * apps/worker/src/jobs/cron.delete.ts's `jobDelete` (M6-001). Finds
 * organizations scheduled for deletion or orphaned (no admin member), and
 * projects individually scheduled for deletion, then sweeps both out of
 * ClickHouse and Postgres in one pass.
 */
export async function runDeleteCron(
  deps: ServiceDeps
): Promise<DeleteCronResult> {
  const db = deps.db;
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

// --- Moved from packages/trpc/src/routers/organization.ts's inline bodies ---

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
    role: 'org:admin' | 'org:member';
    access: { projectId: string; level: 'read' | 'write' }[];
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
      url: `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL}/onboarding?inviteId=${invite.id}`,
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
}

export async function updateOrganizationMemberAccess(
  deps: ServiceDeps,
  input: {
    organizationId: string;
    targetUserId: string;
    access: { projectId: string; level: 'read' | 'write' }[];
  }
) {
  const db = deps.db;
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
    ): ReturnType<typeof updateOrganizationMemberAccess> =>
      updateOrganizationMemberAccess(deps, input),
    members: (organizationId: string): Promise<IServiceMember[]> =>
      getMembers(deps, organizationId),
    invitations: (organizationId: string): Promise<Invite[]> =>
      getInvites(deps, organizationId),
    getInvite: (inviteId: string): ReturnType<typeof getInviteById> =>
      getInviteById(deps, inviteId),
    runDeleteCron: (): Promise<DeleteCronResult> => runDeleteCron(deps),
  };
}
