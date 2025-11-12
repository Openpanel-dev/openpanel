import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr } from 'ramda';

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

  const ip = request.clientIp;
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
  const payload = request.body;
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }
  const ip = request.clientIp;
  const ua = request.headers['user-agent']!;
  const uaInfo = parseUserAgent(ua, payload.properties);
  const geo = await getGeoLocation(ip);

  await upsertProfile({
    ...payload,
    id: payload.profileId,
    isExternal: true,
    projectId,
    properties: {
      ...(payload.properties ?? {}),
      country: geo.country,
      city: geo.city,
      region: geo.region,
      longitude: geo.longitude,
      latitude: geo.latitude,
      os: uaInfo.os,
      os_version: uaInfo.osVersion,
      browser: uaInfo.browser,
      browser_version: uaInfo.browserVersion,
      device: uaInfo.device,
      brand: uaInfo.brand,
      model: uaInfo.model,
    },
  });

  reply.status(202).send(payload.profileId);
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
