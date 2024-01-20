import { db } from '@/server/db';

export function getUserById(id: string) {
  return db.user.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export type IServiceInvite = Awaited<
  ReturnType<typeof getInvitesByOrganizationId>
>[number];
export function getInvitesByOrganizationId(organizationId: string) {
  return db.invite.findMany({
    where: {
      organization_id: organizationId,
    },
  });
}
