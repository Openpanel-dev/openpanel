import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, pathOr } from 'ramda';

import { checkDuplicatedEvent, isDuplicatedEvent } from '@/utils/deduplicate';
import { parseUserAgent } from '@openpanel/common/server';
import { getProfileById, upsertProfile } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import type {
  IncrementProfilePayload,
  UpdateProfilePayload,
} from '@openpanel/sdk';

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
