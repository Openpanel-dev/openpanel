import { auth, clerkClient } from '@clerk/nextjs';
import type {
  Organization,
  OrganizationInvitation,
} from '@clerk/nextjs/dist/types/server';

import { db } from '../prisma-client';

export type IServiceOrganization = Awaited<
  ReturnType<typeof getCurrentOrganizations>
>[number];

export type IServiceInvites = Awaited<ReturnType<typeof getInvites>>;

export function transformOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
  };
}

export async function getCurrentOrganizations() {
  const session = auth();
  const organizations = await clerkClient.users.getOrganizationMembershipList({
    userId: session.userId!,
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
    slug: project.organization_slug,
  });
}

export function transformInvite(invite: OrganizationInvitation) {
  return {
    id: invite.id,
    email: invite.emailAddress,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}

export async function getInvites(organizationId: string) {
  return await clerkClient.organizations
    .getOrganizationInvitationList({
      organizationId,
    })
    .then((invites) => invites.map(transformInvite));
}
