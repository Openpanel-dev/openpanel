// Dissolved into @openpanel/core's tools module (M7-008): site-checker and
// ip-lookup moved to packages/core/src/modules/tools/src/{site-checker,
// ip-lookup}.ts. This file stays (DELEGATE PATTERN) — it is `tools.router.ts`'s
// Fastify glue, a thin wrapper around the core functions, same shape as
// `manage.controller.ts` (M6-002).
import { runIpLookup, runSiteCheck } from '@openpanel/core';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function siteChecker(
  request: FastifyRequest<{ Querystring: { url?: string } }>,
  reply: FastifyReply
) {
  const outcome = await runSiteCheck(
    request.query.url,
    request.headers,
    request.log
  );
  if (outcome.status !== 200) {
    return reply.status(outcome.status).send({ error: outcome.error });
  }
  return reply.send(outcome.result);
}

export async function ipLookup(
  request: FastifyRequest<{ Querystring: { ip?: string } }>,
  reply: FastifyReply
) {
  const outcome = await runIpLookup(
    request.query.ip,
    request.headers,
    request.log
  );
  if (outcome.status !== 200) {
    return reply.status(outcome.status).send({ error: outcome.error });
  }
  return reply.send(outcome.result);
}
