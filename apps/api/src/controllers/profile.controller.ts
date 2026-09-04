import {
  type AdjustProfilePropertyResult,
  adjustProfileProperty,
  getGeoLocation,
  identifyProfile,
  parseUserAgent,
} from '@openpanel/core';
import type {
  DeprecatedIncrementProfilePayload,
  DeprecatedUpdateProfilePayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Dissolved into @openpanel/core's profile module (M7-002): the upsert and
// the increment/decrement arithmetic moved to profile.service.ts's
// `identifyProfile` / `adjustProfileProperty`. These controllers stay
// (DELEGATE PATTERN) — they are the live Fastify handlers, thin wrappers
// resolving `request.client` and translating the result into a Fastify
// reply, same as import.controller.ts.

export async function updateProfile(
  request: FastifyRequest<{
    Body: DeprecatedUpdateProfilePayload;
  }>,
  reply: FastifyReply
) {
  const payload = request.body;
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }
  const userAgent = parseUserAgent(
    request.headers['user-agent'],
    payload.properties
  );
  const geo = await getGeoLocation(request.clientIp);

  await identifyProfile(projectId, payload, { geo, userAgent });

  reply.status(202).send(payload.profileId);
}

function sendAdjusted(
  reply: FastifyReply,
  result: AdjustProfilePropertyResult
) {
  if (result.status === 'not-found') {
    return reply.status(404).send('Not found');
  }
  if (result.status === 'not-a-number') {
    return reply.status(400).send('Not number');
  }
  return reply.status(202).send(result.profileId);
}

export async function incrementProfileProperty(
  request: FastifyRequest<{
    Body: DeprecatedIncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const { profileId, property, value } = request.body;
  const projectId = request.client!.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  const result = await adjustProfileProperty(projectId, {
    profileId,
    property,
    delta: value,
  });
  return sendAdjusted(reply, result);
}

export async function decrementProfileProperty(
  request: FastifyRequest<{
    Body: DeprecatedIncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const { profileId, property, value } = request.body;
  const projectId = request.client?.projectId;
  if (!projectId) {
    return reply.status(400).send('No projectId');
  }

  const result = await adjustProfileProperty(projectId, {
    profileId,
    property,
    delta: -value,
  });
  return sendAdjusted(reply, result);
}
