import { logger } from '@/utils/logger';
import { parseUrlMeta } from '@/utils/parseUrlMeta';
import type { FastifyReply, FastifyRequest } from 'fastify';
import icoToPng from 'ico-to-png';
import sharp from 'sharp';

import { createHash } from '@openpanel/common';
import { getRedisCache } from '@openpanel/redis';

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
  } catch (e) {
    logger.error(e, `Failed to get image from url ${url}`);
  }
}

const imageExtensions = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];

export async function getFavicon(
  request: FastifyRequest<{
    Querystring: GetFaviconParams;
  }>,
  reply: FastifyReply
) {
  function sendBuffer(buffer: Buffer, cacheKey?: string) {
    if (cacheKey) {
      getRedisCache().set(`favicon:${cacheKey}`, buffer.toString('base64'));
    }
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
    'https://www.iconsdb.com/icons/download/orange/warning-128.png'
  );
  if (buffer && buffer.byteLength > 0) {
    return sendBuffer(buffer, hostname);
  }

  return reply.status(404).send('Not found');
}

export async function clearFavicons(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const keys = await getRedisCache().keys('favicon:*');
  for (const key of keys) {
    await getRedisCache().del(key);
  }
  return reply.status(404).send('OK');
}
