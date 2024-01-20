import { db } from '../db';

export type IServiceOrganization = Awaited<
  ReturnType<typeof getOrganizations>
>[number];

export function getOrganizations() {
  return db.organization.findMany({
    where: {
      // users: {
      //   some: {
      //     id: '1',
      //   },
      // }
    },
  });
}

export function getOrganizationById(id: string) {
  return db.organization.findUniqueOrThrow({
    where: {
      id,
    },
  });
}
