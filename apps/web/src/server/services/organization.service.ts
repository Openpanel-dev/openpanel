import { db } from '../db';

export function getOrganizationBySlug(slug: string) {
  return db.organization.findUniqueOrThrow({
    where: {
      slug,
    },
  });
}
