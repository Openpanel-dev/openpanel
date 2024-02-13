import type { FastifyReply, FastifyRequest } from 'fastify';

import { redis } from '@mixan/redis';

interface GetFaviconParams {
  url: string;
}

function toBuffer(arrayBuffer: ArrayBuffer) {
  const buffer = Buffer.alloc(arrayBuffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i]!;
  }
  return buffer;
}

async function getUrlBuffer(url: string) {
  const arrayBuffer = await fetch(url).then((res) => {
    if (res.ok) {
      return res.arrayBuffer();
    }
  });

  if (arrayBuffer) {
    return toBuffer(arrayBuffer);
  }

  return null;
}

export async function getFavicon(
  request: FastifyRequest<{
    Querystring: GetFaviconParams;
  }>,
  reply: FastifyReply
) {
  if (!request.query.url) {
    return reply.status(404).send('Not found');
  }

  function sendBuffer(buffer: Buffer, hostname?: string) {
    if (hostname) {
      redis.set(`favicon:${hostname}`, buffer.toString('base64'));
    }
    reply.type('image/png');
    return reply.send(buffer);
  }

  const url = decodeURIComponent(request.query.url);
  const { hostname, origin } = new URL(url);

  const cache = await redis.get(`favicon:${hostname}`);
  if (cache) {
    return sendBuffer(Buffer.from(cache, 'base64'));
  }

  // Try just get the favicon.ico
  const buffer = await getUrlBuffer(`${origin}/favicon.ico`);
  if (buffer) {
    return sendBuffer(buffer, hostname);
  }

  // If that didnt work try parse html
  const res = await fetch(url).then((res) => res.text());
  const favicon =
    res.match(/<link.*?rel="icon".*?href="(.+?)".*?>/) ||
    res.match(/<link.*?rel="shortcut icon".*?href="(.+?)".*?>/);

  if (favicon?.[1]) {
    const faviconUrl = favicon[1].startsWith('http')
      ? favicon[1]
      : `${origin}${favicon[1]}`;

    const buffer = await getUrlBuffer(faviconUrl);

    if (buffer) {
      return sendBuffer(buffer, hostname);
    }
  }

  return reply.status(404).send('Not found');
}
