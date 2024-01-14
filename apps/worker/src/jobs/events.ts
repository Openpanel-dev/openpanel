import type { Job } from 'bullmq';
import { mergeDeepRight } from 'ramda';

import { db } from '@mixan/db';
import type { EventsQueuePayload } from '@mixan/queue/src/queues';
import type { BatchPayload } from '@mixan/types';

export async function eventsJob(job: Job<EventsQueuePayload>) {
  const projectId = job.data.projectId;
  const body = job.data.payload;

  const profileIds = new Set<string>(
    body
      .map((item) => item.payload.profileId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  if (profileIds.size === 0) {
    return null;
  }

  const profiles = await db.profile.findMany({
    where: {
      id: {
        in: Array.from(profileIds),
      },
    },
  });

  async function getProfile(profileId: string) {
    const profile = profiles.find((profile) => profile.id === profileId);
    if (profile) {
      return profile;
    }

    const created = await db.profile.create({
      data: {
        id: profileId,
        properties: {},
        project_id: projectId,
      },
    });

    profiles.push(created);

    return created;
  }

  const mergedBody: BatchPayload[] = body.reduce((acc, item) => {
    const canMerge =
      item.type === 'update_profile' || item.type === 'update_session';

    if (!canMerge) {
      return [...acc, item];
    }

    const match = acc.findIndex(
      (i) =>
        i.type === item.type && i.payload.profileId === item.payload.profileId
    );

    if (acc[match]) {
      acc[match]!.payload = mergeDeepRight(acc[match]!.payload, item.payload);
    } else {
      acc.push(item);
    }

    return acc;
  }, [] as BatchPayload[]);

  const failedEvents: BatchPayload[] = [];

  for (const item of mergedBody) {
    try {
      const { type, payload } = item;
      const profile = await getProfile(payload.profileId);
      switch (type) {
        case 'create_profile': {
          profile.properties = {
            ...(typeof profile.properties === 'object'
              ? profile.properties ?? {}
              : {}),
            ...(payload.properties ?? {}),
          };
          await db.profile.update({
            where: {
              id: payload.profileId,
            },
            data: {
              properties: profile.properties,
            },
          });
          break;
        }
        case 'update_profile': {
          profile.properties = {
            ...(typeof profile.properties === 'object'
              ? profile.properties ?? {}
              : {}),
            ...(payload.properties ?? {}),
          };
          await db.profile.update({
            where: {
              id: payload.profileId,
            },
            data: {
              external_id: payload.id,
              email: payload.email,
              first_name: payload.first_name,
              last_name: payload.last_name,
              avatar: payload.avatar,
              properties: profile.properties,
            },
          });
          break;
        }
        case 'set_profile_property': {
          if (
            typeof (profile.properties as Record<string, unknown>)[
              payload.name
            ] === 'undefined'
          ) {
            (profile.properties as Record<string, unknown>)[payload.name] =
              payload.value;

            await db.profile.update({
              where: {
                id: payload.profileId,
              },
              data: {
                // @ts-expect-error
                properties: profile.properties,
              },
            });
          }
          break;
        }
        case 'increment': {
          await tickProfileProperty({
            profileId: payload.profileId,
            name: payload.name,
            tick: payload.value,
          });
          break;
        }
        case 'decrement': {
          await tickProfileProperty({
            profileId: payload.profileId,
            name: payload.name,
            tick: -Math.abs(payload.value),
          });
          break;
        }
        case 'event': {
          await db.event.create({
            data: {
              name: payload.name,
              properties: payload.properties,
              createdAt: payload.time,
              project_id: projectId,
              profile_id: payload.profileId,
            },
          });
          break;
        }
        case 'update_session': {
          const session = await db.event.findFirst({
            where: {
              profile_id: payload.profileId,
              project_id: projectId,
              name: 'session_start',
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          if (session) {
            await db.$executeRawUnsafe(
              `UPDATE events SET properties = '${JSON.stringify(
                payload.properties
              )}' || properties WHERE "createdAt" >= '${session.createdAt.toISOString()}' AND profile_id = '${
                payload.profileId
              }'`
            );
          }
          break;
        }
      }
    } catch (error) {
      job.log(`Failed to create "${item.type}"`);
      job.log(`  > Payload: ${JSON.stringify(item.payload)}`);
      if (error instanceof Error) {
        job.log(`  > Error: ${error.message.trim()}`);
        job.log(`  > Stack: ${error.stack}`);
      }
      failedEvents.push(item);
      job.log(`---`);
    }
  } // end for

  await db.eventFailed.createMany({
    data: failedEvents.map((item) => ({
      data: item as Record<string, any>,
    })),
  });

  return body;
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
  const profile = await db.profile.findUniqueOrThrow({
    where: {
      id: profileId,
    },
  });

  const properties = (
    typeof profile.properties === 'object' ? profile.properties ?? {} : {}
  ) as Record<string, number>;
  const value = name in properties ? properties[name] : 0;

  if (typeof value !== 'number') {
    return `Property "${name}" on user is of type ${typeof value}`;
  }

  if (typeof tick !== 'number') {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `Value is not a number ${tick} (${typeof tick})`;
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
