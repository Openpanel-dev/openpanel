import { db } from '../prisma-client';

export type IServiceProfile = Awaited<ReturnType<typeof getProfileById>>;

export function getProfileById(id: string) {
  return db.profile.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export function getProfilesByExternalId(
  externalId: string | null,
  projectId: string
) {
  if (externalId === null) {
    return [];
  }

  return db.profile.findMany({
    where: {
      external_id: externalId,
      project_id: projectId,
    },
  });
}

export function getProfile(id: string) {
  return db.profile.findUniqueOrThrow({
    where: {
      id,
    },
  });
}
