import { logger } from '@/utils/logger';
import { parseUrlMeta } from '@/utils/parseUrlMeta';
import type { FastifyReply, FastifyRequest } from 'fastify';
import icoToPng from 'ico-to-png';
import sharp from 'sharp';

import { getClientIp } from '@/utils/get-client-ip';
import { createHash } from '@openpanel/common/server';
import { TABLE_NAMES, ch, chQuery, formatClickhouseDate } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import { cacheable, getCache, getRedisCache } from '@openpanel/redis';

interface GetFaviconParams {
  url: string;
}

async function getImageBuffer(url: string) {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get('content-type');

    if (!contentType?.includes('image')) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    if (contentType === 'image/x-icon' || url.endsWith('.ico')) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return await icoToPng(buffer, 30);
    }

    return await sharp(await res.arrayBuffer())
      .resize(30, 30, {
        fit: 'cover',
      })
      .png()
      .toBuffer();
  } catch (error) {
    logger.error('Failed to get image from url', {
      error,
      url,
    });
  }
}

const imageExtensions = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];

export async function getFavicon(
  request: FastifyRequest<{
    Querystring: GetFaviconParams;
  }>,
  reply: FastifyReply,
) {
  function sendBuffer(buffer: Buffer, cacheKey?: string) {
    if (cacheKey) {
      getRedisCache().set(`favicon:${cacheKey}`, buffer.toString('base64'));
    }
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.header('Expires', new Date(Date.now() + 604800000).toUTCString());
    reply.type('image/png');
    return reply.send(buffer);
  }

  if (!request.query.url) {
    return reply.status(404).send('Not found');
  }

  const url = decodeURIComponent(request.query.url);

  if (imageExtensions.find((ext) => url.endsWith(ext))) {
    const cacheKey = createHash(url, 32);
    const cache = await getRedisCache().get(`favicon:${cacheKey}`);
    if (cache) {
      return sendBuffer(Buffer.from(cache, 'base64'));
    }
    const buffer = await getImageBuffer(url);
    if (buffer && buffer.byteLength > 0) {
      return sendBuffer(buffer, cacheKey);
    }
  }

  const { hostname } = new URL(url);
  const cache = await getRedisCache().get(`favicon:${hostname}`);

  if (cache) {
    return sendBuffer(Buffer.from(cache, 'base64'));
  }

  const meta = await parseUrlMeta(url);
  if (meta?.favicon) {
    const buffer = await getImageBuffer(meta.favicon);
    if (buffer && buffer.byteLength > 0) {
      return sendBuffer(buffer, hostname);
    }
  }

  const buffer = await getImageBuffer(
    'https://www.iconsdb.com/icons/download/orange/warning-128.png',
  );
  if (buffer && buffer.byteLength > 0) {
    return sendBuffer(buffer, hostname);
  }

  return reply.status(404).send('Not found');
}

export async function clearFavicons(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const keys = await getRedisCache().keys('favicon:*');
  for (const key of keys) {
    await getRedisCache().del(key);
  }
  return reply.status(404).send('OK');
}

export async function ping(
  request: FastifyRequest<{
    Body: {
      domain: string;
      count: number;
    };
  }>,
  reply: FastifyReply,
) {
  try {
    await ch.insert({
      table: TABLE_NAMES.self_hosting,
      values: [
        {
          domain: request.body.domain,
          count: request.body.count,
          created_at: formatClickhouseDate(new Date(), true),
        },
      ],
      format: 'JSONEachRow',
    });
    reply.status(200).send({
      message: 'Success',
      count: request.body.count,
      domain: request.body.domain,
    });
  } catch (error) {
    request.log.error('Failed to insert ping', {
      error,
    });
    reply.status(500).send({
      error: 'Failed to insert ping',
    });
  }
}

export async function stats(request: FastifyRequest, reply: FastifyReply) {
  const res = await getCache('api:stats', 60 * 60, async () => {
    const projects = await chQuery<{ project_id: string; count: number }>(
      `SELECT project_id, count(*) as count from ${TABLE_NAMES.events} GROUP by project_id order by count()`,
    );
    const last24h = await chQuery<{ count: number }>(
      `SELECT count(*) as count from ${TABLE_NAMES.events} WHERE created_at > now() - interval '24 hours'`,
    );
    return { projects, last24hCount: last24h[0]?.count || 0 };
  });

  reply.status(200).send({
    projectsCount: res.projects.length,
    eventsCount: res.projects.reduce((acc, { count }) => acc + count, 0),
    eventsLast24hCount: res.last24hCount,
  });
}

export async function getGeo(request: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(request);
  if (!ip) {
    return reply.status(400).send('Bad Request');
  }
  const geo = await getGeoLocation(ip);
  return reply.status(200).send(geo);
}
