import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr } from 'ramda';

import { checkDuplicatedEvent, isDuplicatedEvent } from '@/utils/deduplicate';
import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import { getProfileById, getSalts, upsertProfile } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import { getRedisCache } from '@openpanel/redis';
import type {
  IncrementProfilePayload,
  UpdateProfilePayload,
} from '@openpanel/sdk';

export async function info(request: FastifyRequest, reply: FastifyReply) {
  const salts = await getSalts();
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  const ip = getClientIp(request)!;
  if (!ip) {
    return reply.status(400).send('Missing ip address');
  }

  const ua = request.headers['user-agent']!;
  if (!ua) {
    return reply.status(400).send('Missing header: user-agent');
  }

  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin: projectId,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
    salt: salts.previous,
    origin: projectId,
    ip,
    ua,
  });

  try {
    const multi = getRedisCache().multi();
    multi.exists(`bull:sessions:sessionEnd:${projectId}:${currentDeviceId}`);
    multi.exists(`bull:sessions:sessionEnd:${projectId}:${previousDeviceId}`);
    const res = await multi.exec();

    if (res?.[0]?.[1]) {
      return {
        deviceId: currentDeviceId,
      };
    }

    if (res?.[1]?.[1]) {
      return {
        deviceId: previousDeviceId,
      };
    }
  } catch (error) {
    request.log.error('Error getting session end GET /profile', error);
  }

  return {
    deviceId: '',
  };
}
export async function updateProfile(
  request: FastifyRequest<{
    Body: UpdateProfilePayload;
  }>,
  reply: FastifyReply,
) {
  const { profileId, properties, ...rest } = request.body;
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const uaInfo = parseUserAgent(ua, properties);
  const geo = await getGeoLocation(ip);

  if (
    await checkDuplicatedEvent({
      reply,
      payload: {
        ...request.body,
      },
      projectId,
    })
  ) {
    return;
  }

  await upsertProfile({
    id: profileId,
    isExternal: true,
    projectId,
    properties: {
      ...(properties ?? {}),
      ...(ip ? geo : {}),
      ...uaInfo,
    },
    ...rest,
  });

  reply.status(202).send(profileId);
}

export async function incrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply,
) {
  const { profileId, property, value } = request.body;
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  if (
    await checkDuplicatedEvent({
      reply,
      payload: {
        ...request.body,
      },
      projectId,
    })
  ) {
    return;
  }

  const profile = await getProfileById(profileId, projectId);
  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10,
  );

  if (Number.isNaN(parsed)) {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + value,
    profile.properties,
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });

  reply.status(202).send(profile.id);
}

export async function decrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply,
) {
  const { profileId, property, value } = request.body;
  const projectId = request.client?.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  if (
    await checkDuplicatedEvent({
      reply,
      payload: {
        ...request.body,
      },
      projectId,
    })
  ) {
    return;
  }

  const profile = await getProfileById(profileId, projectId);
  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const parsed = Number.parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10,
  );

  if (Number.isNaN(parsed)) {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed - value,
    profile.properties,
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
    isExternal: true,
  });

  reply.status(202).send(profile.id);
}
