import { auth, clerkClient } from '@clerk/nextjs';
import type { Organization } from '@clerk/nextjs/dist/types/server';

import { db } from '../db';

export type IServiceOrganization = Awaited<
  ReturnType<typeof getOrganizations>
>[number];

function transformOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
  };
}

export async function getOrganizations() {
  const orgs = await clerkClient.organizations.getOrganizationList();
  return orgs.map(transformOrganization);
}

export async function getCurrentOrganization() {
  const session = auth();
  if (!session?.orgSlug) {
    return null;
  }

  const organization = await clerkClient.organizations.getOrganization({
    slug: session.orgSlug,
  });

  return transformOrganization(organization);
}

export function getOrganizationBySlug(slug: string) {
  return clerkClient.organizations
    .getOrganization({ slug })
    .then(transformOrganization);
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
