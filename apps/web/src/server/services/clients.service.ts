import { db } from '@mixan/db';

export function getClientsByOrganizationId(organizationId: string) {
  return db.client.findMany({
    where: {
      organization_id: organizationId,
    },
    include: {
      project: true,
    },
  });
}
