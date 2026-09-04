// Dissolved into @openpanel/core's misc module (M7-008): favicon/OG proxy,
// stats and geo lookup moved to
// packages/core/src/modules/misc/misc.service.ts. This file stays
// (DELEGATE PATTERN) — it is `misc.router.ts`'s Fastify glue, a thin wrapper
// around the core functions, same shape as `manage.controller.ts` (M6-002).
//
// `GET /misc/og/clear` and `/misc/favicon/clear` are dropped, not ported
// (ADR-015 entry #6: RULED + DEAD — `docs/ANSWERS.md` §1.4 confirms nothing
// depends on them).
import {
  getFavicon as getFaviconCore,
  getGeoReport,
  getOgImage as getOgImageCore,
  getStats,
  type ImageAssetResult,
  insertPingRecord,
} from '@openpanel/core';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface GetFaviconParams {
  url: string;
}

function sendImageAsset(reply: FastifyReply, result: ImageAssetResult) {
  for (const [name, value] of Object.entries(result.headers)) {
    reply.header(name, value);
  }
  if (result.status === 200) {
    return reply.status(200).send(result.buffer);
  }
  return reply.status(result.status).send(result.body);
}

export async function getFavicon(
  request: FastifyRequest<{ Querystring: GetFaviconParams }>,
  reply: FastifyReply
) {
  return sendImageAsset(
    reply,
    await getFaviconCore(request.query.url, request.log)
  );
}

export async function getOgImage(
  request: FastifyRequest<{ Querystring: { url: string } }>,
  reply: FastifyReply
) {
  return sendImageAsset(
    reply,
    await getOgImageCore(request.query.url, request.log)
  );
}

export async function ping(
  request: FastifyRequest<{
    Body: {
      domain: string;
      count: number;
    };
  }>,
  reply: FastifyReply
) {
  try {
    await insertPingRecord(request.body);
    reply.status(200).send({
      message: 'Success',
      count: request.body.count,
      domain: request.body.domain,
    });
  } catch (error) {
    request.log.error({ err: error }, 'Failed to insert ping');
    reply.status(500).send({
      error: 'Failed to insert ping',
    });
  }
}

export async function stats(_request: FastifyRequest, reply: FastifyReply) {
  reply.status(200).send(await getStats());
}

export async function getGeo(request: FastifyRequest, reply: FastifyReply) {
  const report = await getGeoReport(request.headers);
  if (!report.ok) {
    return reply.status(400).send('Bad Request');
  }
  return reply
    .status(200)
    .send({ selected: report.selected, ...report.others });
}
