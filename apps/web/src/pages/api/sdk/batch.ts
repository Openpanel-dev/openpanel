import { validateSdkRequest } from '@/server/auth';
import { db } from '@/server/db';
import { createError, handleError } from '@/server/exceptions';
import { tickProfileProperty } from '@/server/services/profile.service';
import { Prisma } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { mergeDeepRight } from 'ramda';

import type { BatchPayload } from '@mixan/types';

interface Request extends NextApiRequest {
  body: BatchPayload[];
}

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: Request, res: NextApiResponse) {
  if (req.method == 'OPTIONS') {
    await validateSdkRequest(req, res);
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return handleError(res, createError(405, 'Method not allowed'));
  }

  const time = Date.now();

  try {
    // Check client id & secret
    const projectId = await validateSdkRequest(req, res);

    const profileIds = new Set<string>(
      req.body
        .map((item) => item.payload.profileId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    if (profileIds.size === 0) {
      return res.status(400).json({ status: 'error' });
    }

    const profiles = await db.profile.findMany({
      where: {
        id: {
          in: Array.from(profileIds),
        },
      },
    });

    // eslint-disable-next-line no-inner-declarations
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

    const mergedBody: BatchPayload[] = req.body.reduce((acc, item) => {
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
        console.log(`Failed to create "${item.type}"`);
        console.log('  > Payload:', item.payload);
        console.log('  > Error:', error);
        failedEvents.push(item);
      }
    } // end for

    await db.eventFailed.createMany({
      data: failedEvents.map((item) => ({
        data: item as Record<string, any>,
      })),
    });

    console.log('Batch took', Date.now() - time, 'ms', {
      events: req.body.length,
      combined: mergedBody.length,
    });

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    handleError(res, error);
  }
}
