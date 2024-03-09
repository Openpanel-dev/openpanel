import type { Project } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceProject = ReturnType<typeof transform>;

function transform({ organization_slug, ...project }: Project) {
  return {
    organizationSlug: organization_slug,
    ...project,
  };
}

export async function getProjectById(id: string) {
  const res = await db.project.findUnique({
    where: {
      id,
    },
  });

  if (!res) {
    return null;
  }

  return transform(res);
}

export async function getProjectsByOrganizationSlug(slug: string) {
  const res = await db.project.findMany({
    where: {
      organization_slug: slug,
    },
  });

  return res.map(transform);
}
