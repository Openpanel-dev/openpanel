import { db } from '@mixan/db';

export function getClientsByOrganizationId(organizationId: string) {
  return db.client.findMany({
    where: {
      organization_slug: organizationId,
    },
    include: {
      project: true,
    },
  });
}
