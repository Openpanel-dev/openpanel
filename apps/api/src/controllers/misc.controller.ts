import type { FastifyReply, FastifyRequest } from 'fastify';
import icoToPng from 'ico-to-png';
import sharp from 'sharp';

import { createHash } from '@mixan/common';
import { redis } from '@mixan/redis';

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
    console.log('Failed to get image from url', url);
    console.log(e);
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
      redis.set(`favicon:${cacheKey}`, buffer.toString('base64'));
    }
    reply.type('image/png');
    console.log('buffer', buffer.byteLength);

    return reply.send(buffer);
  }

  if (!request.query.url) {
    return reply.status(404).send('Not found');
  }

  const url = decodeURIComponent(request.query.url);

  // DIRECT IMAGE
  if (imageExtensions.find((ext) => url.endsWith(ext))) {
    const cacheKey = createHash(url, 32);
    const cache = await redis.get(`favicon:${cacheKey}`);
    if (cache) {
      return sendBuffer(Buffer.from(cache, 'base64'));
    }
    const buffer = await getImageBuffer(url);
    if (buffer && buffer.byteLength > 0) {
      return sendBuffer(buffer, cacheKey);
    }
  }

  const { hostname, origin } = new URL(url);
  const cache = await redis.get(`favicon:${hostname}`);
  if (cache) {
    return sendBuffer(Buffer.from(cache, 'base64'));
  }

  // TRY FAVICON.ICO
  const buffer = await getImageBuffer(`${origin}/favicon.ico`);
  if (buffer && buffer.byteLength > 0) {
    return sendBuffer(buffer, hostname);
  }

  // PARSE HTML
  const res = await fetch(url).then((res) => res.text());

  function findFavicon(res: string) {
    const match = res.match(
      /(\<link(.+?)image\/x-icon(.+?)\>|\<link(.+?)shortcut\sicon(.+?)\>)/
    );
    if (!match) {
      return null;
    }

    return match[0].match(/href="(.+?)"/)?.[1] ?? null;
  }

  const favicon = findFavicon(res);
  if (favicon) {
    const buffer = await getImageBuffer(favicon);

    if (buffer && buffer.byteLength > 0) {
      return sendBuffer(buffer, hostname);
    }
  }

  return reply.status(404).send('Not found');
}

export async function clearFavicons(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const keys = await redis.keys('favicon:*');
  for (const key of keys) {
    await redis.del(key);
  }
  return reply.status(404).send('OK');
}
