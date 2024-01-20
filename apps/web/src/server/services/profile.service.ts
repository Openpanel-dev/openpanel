import { db } from '@/server/db';
import { HttpError } from '@/server/exceptions';

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

export async function tickProfileProperty({
  profileId,
  tick,
  name,
}: {
  profileId: string;
  tick: number;
  name: string;
}) {
  const profile = await getProfile(profileId);

  if (!profile) {
    throw new HttpError(404, `Profile not found ${profileId}`);
  }

  const properties = (
    typeof profile.properties === 'object' ? profile.properties ?? {} : {}
  ) as Record<string, number>;
  const value = name in properties ? properties[name] : 0;

  if (typeof value !== 'number') {
    throw new HttpError(
      400,
      `Property "${name}" on user is of type ${typeof value}`
    );
  }

  if (typeof tick !== 'number') {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new HttpError(400, `Value is not a number ${tick} (${typeof tick})`);
  }

  await db.profile.update({
    where: {
      id: profileId,
    },
    data: {
      properties: {
        ...properties,
        [name]: value + tick,
      },
    },
  });
}
