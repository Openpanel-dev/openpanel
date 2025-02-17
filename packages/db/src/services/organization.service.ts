import type {
  Invite,
  Organization,
  Prisma,
  ProjectAccess,
  User,
} from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceOrganization = ReturnType<typeof transformOrganization>;
export type IServiceInvite = Invite;
export type IServiceMember = Prisma.MemberGetPayload<{
  include: { user: true };
}> & { access: ProjectAccess[] };
export type IServiceProjectAccess = ProjectAccess;

export function transformOrganization(org: Organization) {
  return {
    id: org.id,
    slug: org.id,
    name: org.name,
    createdAt: org.createdAt,
  };
}

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

  return organizations.map(transformOrganization);
}

export function getOrganizationBySlug(slug: string) {
  return db.organization.findUnique({
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

  return transformOrganization(project.organization);
}

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
