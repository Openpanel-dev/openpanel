import { DateTime } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import { escape } from 'sqlstring';
import { chQuery, formatClickhouseDate } from '../clickhouse/client';
import type { Invite, Prisma, ProjectAccess, User } from '../prisma-client';
import { db } from '../prisma-client';
import { createSqlBuilder } from '../sql-builder';
import type { IServiceProject } from './project.service';
export type IServiceOrganization = Awaited<
  ReturnType<typeof db.organization.findUniqueOrThrow>
>;
export type IServiceInvite = Invite;
export type IServiceMember = Prisma.MemberGetPayload<{
  include: { user: true };
}> & { access: ProjectAccess[] };
export type IServiceProjectAccess = ProjectAccess;

export async function getOrganizations(userId: string | null) {
  if (!userId) return [];

  const organizations = await db.organization.findMany({
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

  return organizations;
}

export function getOrganizationById(slug: string) {
  return db.organization.findUniqueOrThrow({
    where: {
      id: slug,
    },
  });
}

export async function getOrganizationByProjectId(projectId: string) {
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

export const getOrganizationByProjectIdCached = cacheable(
  getOrganizationByProjectId,
  60 * 60 * 24,
);

export async function getInvites(organizationId: string) {
  return db.invite.findMany({
    where: {
      organizationId,
    },
  });
}

export function getInviteById(inviteId: string) {
  return db.invite.findUnique({
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
}

export async function getMembers(organizationId: string) {
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
  }));
}

export async function getMember(organizationId: string, userId: string) {
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
  // Use primary since before this we might have just created the invite
  // If we use replica it might not find the invite
  const invite = await db.$primary().invite.findUnique({
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

  const member = await db.member.create({
    data: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      email: user.email,
      invitedById: invite.createdById,
    },
  });

  if (invite.projectAccess.length > 0) {
    for (const projectId of invite.projectAccess) {
      await db.projectAccess.create({
        data: {
          projectId,
          userId: user.id,
          organizationId: invite.organizationId,
          level: 'write',
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
  organization: IServiceOrganization & { projects: IServiceProject[] },
) {
  // Dont count events if the organization has no subscription
  // Since we only use this for billing purposes
  if (
    !organization.subscriptionCurrentPeriodStart ||
    !organization.subscriptionCurrentPeriodEnd
  ) {
    return 0;
  }

  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.where.projectIds = `project_id IN (${organization.projects.map((project) => escape(project.id)).join(',')})`;
  sb.where.createdAt = `created_at BETWEEN ${escape(formatClickhouseDate(organization.subscriptionCurrentPeriodStart))} AND ${escape(formatClickhouseDate(organization.subscriptionCurrentPeriodEnd))}`;

  const res = await chQuery<{ count: number }>(getSql());
  return res[0]?.count;
}

export async function getOrganizationBillingEventsCountSerie(
  organization: IServiceOrganization & { projects: { id: string }[] },
  {
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  },
) {
  const interval = 'day';
  const { sb, getSql } = createSqlBuilder();

  sb.select.count = 'COUNT(*) AS count';
  sb.select.day = `toDate(toStartOf${interval.slice(0, 1).toUpperCase() + interval.slice(1)}(created_at)) AS ${interval}`;
  sb.groupBy.day = interval;
  sb.orderBy.day = `${interval} WITH FILL FROM toDate(${escape(formatClickhouseDate(startDate, true))}) TO toDate(${escape(formatClickhouseDate(endDate, true))}) STEP INTERVAL 1 ${interval.toUpperCase()}`;
  sb.where.projectIds = `project_id IN (${organization.projects.map((project) => escape(project.id)).join(',')})`;
  sb.where.createdAt = `${interval} BETWEEN ${escape(formatClickhouseDate(startDate, true))} AND ${escape(formatClickhouseDate(endDate, true))}`;

  const res = await chQuery<{ count: number; day: string }>(getSql());
  return res;
}

export const getOrganizationBillingEventsCountSerieCached = cacheable(
  getOrganizationBillingEventsCountSerie,
  60 * 10,
);

export async function getOrganizationSubscriptionChartEndDate(
  projectId: string,
  endDate: string,
) {
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

const DEFAULT_TIMEZONE = 'UTC';

export async function getSettingsForOrganization(organizationId: string) {
  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: organizationId,
    },
  });

  return {
    timezone: organization.timezone || DEFAULT_TIMEZONE,
  };
}

export async function getSettingsForProject(projectId: string) {
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
