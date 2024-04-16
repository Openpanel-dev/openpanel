import { auth, clerkClient } from '@clerk/nextjs';
import type {
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
} from '@clerk/nextjs/dist/types/server';

import type { ProjectAccess } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceOrganization = ReturnType<typeof transformOrganization>;
export type IServiceInvite = ReturnType<typeof transformInvite>;
export type IServiceMember = ReturnType<typeof transformMember>;
export type IServiceProjectAccess = ProjectAccess;

export function transformOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug!,
  };
}

export async function getCurrentOrganizations() {
  const session = auth();
  if (!session.userId) return [];
  const organizations = await clerkClient.users.getOrganizationMembershipList({
    userId: session.userId,
  });
  return organizations.map((item) => transformOrganization(item.organization));
}

export function getOrganizationBySlug(slug: string) {
  return clerkClient.organizations
    .getOrganization({ slug })
    .then(transformOrganization)
    .catch(() => null);
}

export async function getOrganizationByProjectId(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: projectId,
    },
  });

  return clerkClient.organizations.getOrganization({
    slug: project.organizationSlug,
  });
}

export function transformInvite(invite: OrganizationInvitation) {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.emailAddress,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    publicMetadata: invite.publicMetadata,
  };
}

export async function getInvites(organizationSlug: string) {
  const org = await getOrganizationBySlug(organizationSlug);
  if (!org) return [];
  return await clerkClient.organizations
    .getOrganizationInvitationList({
      organizationId: org.id,
    })
    .then((invites) => invites.map(transformInvite));
}

export function transformMember(
  item: OrganizationMembership & {
    access: IServiceProjectAccess[];
  }
) {
  return {
    memberId: item.id,
    id: item.publicUserData?.userId,
    name:
      [item.publicUserData?.firstName, item.publicUserData?.lastName]
        .filter(Boolean)
        .join(' ') || 'Unknown',
    role: item.role,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    publicMetadata: item.publicMetadata,
    organization: transformOrganization(item.organization),
    access: item.access,
  };
}

export async function getMembers(organizationSlug: string) {
  const org = await getOrganizationBySlug(organizationSlug);
  if (!org) return [];
  const [members, access] = await Promise.all([
    clerkClient.organizations.getOrganizationMembershipList({
      organizationId: org.id,
    }),
    db.projectAccess.findMany({
      where: {
        organizationSlug,
      },
    }),
  ]);

  return members
    .map((member) => {
      const projectAccess = access.filter(
        (item) => item.userId === member.publicUserData?.userId
      );
      return {
        ...member,
        access: projectAccess,
      };
    })
    .map(transformMember);
}

export async function getMember(organizationSlug: string, userId: string) {
  const org = await getOrganizationBySlug(organizationSlug);
  if (!org) return null;
  const members = await getMembers(org.id);
  return members.find((member) => member.id === userId) ?? null;
}
