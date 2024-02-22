import { getClientIp, parseIp } from '@/utils/parseIp';
import { isUserAgentSet, parseUserAgent } from '@/utils/parseUserAgent';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr } from 'ramda';

import { getProfileById, upsertProfile } from '@mixan/db';
import type {
  IncrementProfilePayload,
  UpdateProfilePayload,
} from '@mixan/types';

export async function updateProfile(
  request: FastifyRequest<{
    Body: UpdateProfilePayload;
  }>,
  reply: FastifyReply
) {
  const { profileId, properties, ...rest } = request.body;
  const projectId = request.projectId;
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const uaInfo = parseUserAgent(ua);
  const geo = await parseIp(ip);

  await upsertProfile({
    id: profileId,
    projectId,
    properties: {
      ...(properties ?? {}),
      ...(ip ? geo : {}),
      ...(isUserAgentSet(ua) ? uaInfo : {}),
    },
    ...rest,
  });

  reply.status(202).send(profileId);
}

export async function incrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const { profileId, property, value } = request.body;
  const projectId = request.projectId;

  const profile = await getProfileById(profileId);
  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const parsed = parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (isNaN(parsed)) {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed + value,
    profile.properties
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
  });

  reply.status(202).send(profile.id);
}

export async function decrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const { profileId, property, value } = request.body;
  const projectId = request.projectId;

  const profile = await getProfileById(profileId);
  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const parsed = parseInt(
    pathOr<string>('0', property.split('.'), profile.properties),
    10
  );

  if (isNaN(parsed)) {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    property.split('.'),
    parsed - value,
    profile.properties
  );

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: profile.properties,
  });

  reply.status(202).send(profile.id);
}
