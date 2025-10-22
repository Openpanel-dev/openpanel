import crypto from 'node:crypto';
import { logger } from '@/utils/logger';
import { parseUrlMeta } from '@/utils/parseUrlMeta';
import type { FastifyReply, FastifyRequest } from 'fastify';
import sharp from 'sharp';

import { getClientIp } from '@/utils/get-client-ip';
import { TABLE_NAMES, ch, chQuery, formatClickhouseDate } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import { getCache, getRedisCache } from '@openpanel/redis';

interface GetFaviconParams {
  url: string;
}

// Configuration
const TTL_SECONDS = 60 * 60 * 24; // 24h
const MAX_BYTES = 1_000_000; // 1MB cap
const USER_AGENT = 'OpenPanel-FaviconProxy/1.0 (+https://openpanel.dev)';

// Helper functions
function createCacheKey(url: string, prefix = 'favicon'): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return `${prefix}:v2:${hash}`;
}

function validateUrl(raw?: string): URL | null {
  try {
    if (!raw) throw new Error('Missing ?url');
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }
    return url;
  } catch (error) {
    return null;
  }
}

// Binary cache functions (more efficient than base64)
async function getFromCacheBinary(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const redis = getRedisCache();
  const [bufferBase64, contentType] = await Promise.all([
    redis.get(key),
    redis.get(`${key}:ctype`),
  ]);

  if (!bufferBase64 || !contentType) return null;
  return { buffer: Buffer.from(bufferBase64, 'base64'), contentType };
}

async function setToCacheBinary(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const redis = getRedisCache();
  await Promise.all([
    redis.set(key, buffer.toString('base64'), 'EX', TTL_SECONDS),
    redis.set(`${key}:ctype`, contentType, 'EX', TTL_SECONDS),
  ]);
}

// Fetch image with timeout and size limits
async function fetchImage(
  url: URL,
): Promise<{ buffer: Buffer; contentType: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        buffer: Buffer.alloc(0),
        contentType: 'text/plain',
        status: response.status,
      };
    }

    // Size guard
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BYTES) {
      throw new Error(`Remote file too large: ${contentLength} bytes`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Additional size check for actual content
    if (buffer.length > MAX_BYTES) {
      throw new Error('Remote file exceeded size limit');
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType, status: 200 };
  } catch (error) {
    clearTimeout(timeout);
    return { buffer: Buffer.alloc(0), contentType: 'text/plain', status: 500 };
  }
}

// Check if URL is an ICO file
function isIcoFile(url: string, contentType?: string): boolean {
  return url.toLowerCase().endsWith('.ico') || contentType === 'image/x-icon';
}
function isSvgFile(url: string, contentType?: string): boolean {
  return url.toLowerCase().endsWith('.svg') || contentType === 'image/svg+xml';
}

// Process image with Sharp (resize to 30x30 PNG)
async function processImage(
  buffer: Buffer,
  originalUrl?: string,
  contentType?: string,
): Promise<Buffer> {
  // If it's an ICO file, just return it as-is (no conversion needed)
  if (originalUrl && isIcoFile(originalUrl, contentType)) {
    logger.debug('Serving ICO file directly', {
      originalUrl,
      bufferSize: buffer.length,
    });
    return buffer;
  }

  if (originalUrl && isSvgFile(originalUrl, contentType)) {
    logger.debug('Serving SVG file directly', {
      originalUrl,
      bufferSize: buffer.length,
    });
    return buffer;
  }

  // If buffer isnt to big just return it as well
  if (buffer.length < 5000) {
    logger.debug('Serving image directly without processing', {
      originalUrl,
      bufferSize: buffer.length,
    });
    return buffer;
  }

  try {
    // For other formats, process with Sharp
    return await sharp(buffer)
      .resize(30, 30, {
        fit: 'cover',
      })
      .png()
      .toBuffer();
  } catch (error) {
    logger.warn('Sharp failed to process image, trying fallback', {
      error: error instanceof Error ? error.message : 'Unknown error',
      originalUrl,
      bufferSize: buffer.length,
    });

    // If Sharp fails, try to create a simple fallback image
    return createFallbackImage();
  }
}

// Create a simple transparent fallback image when Sharp can't process the original
function createFallbackImage(): Buffer {
  // 1x1 transparent PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
}

// Process OG image with Sharp (resize to 300px width)
async function processOgImage(
  buffer: Buffer,
  originalUrl?: string,
  contentType?: string,
): Promise<Buffer> {
  // If buffer is small enough, return it as-is
  if (buffer.length < 10000) {
    logger.debug('Serving OG image directly without processing', {
      originalUrl,
      bufferSize: buffer.length,
    });
    return buffer;
  }

  try {
    // For OG images, process with Sharp to 300px width, maintaining aspect ratio
    return await sharp(buffer)
      .resize(300, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (error) {
    logger.warn('Sharp failed to process OG image, trying fallback', {
      error: error instanceof Error ? error.message : 'Unknown error',
      originalUrl,
      bufferSize: buffer.length,
    });

    // If Sharp fails, try to create a simple fallback image
    return createFallbackImage();
  }
}

// Check if URL is a direct image
function isDirectImage(url: URL): boolean {
  const imageExtensions = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'];
  return (
    imageExtensions.some((ext) => url.pathname.endsWith(`.${ext}`)) ||
    url.toString().includes('googleusercontent.com')
  );
}

export async function getFavicon(
  request: FastifyRequest<{
    Querystring: GetFaviconParams;
  }>,
  reply: FastifyReply,
) {
  try {
    const url = validateUrl(request.query.url);
    if (!url) {
      return createFallbackImage();
    }

    const cacheKey = createCacheKey(url.toString());

    // Check cache first
    const cached = await getFromCacheBinary(cacheKey);
    if (cached) {
      reply.header('Content-Type', cached.contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(cached.buffer);
    }

    let imageUrl: URL;

    // If it's a direct image URL, use it directly
    if (isDirectImage(url)) {
      imageUrl = url;
    } else {
      // For website URLs, extract favicon from HTML
      const meta = await parseUrlMeta(url.toString());
      if (meta?.favicon) {
        imageUrl = new URL(meta.favicon);
      } else {
        // Fallback to Google's favicon service
        const { hostname } = url;
        imageUrl = new URL(
          `https://www.google.com/s2/favicons?domain=${hostname}&sz=256`,
        );
      }
    }

    // Fetch the image
    const { buffer, contentType, status } = await fetchImage(imageUrl);

    if (status !== 200 || buffer.length === 0) {
      return reply.send(createFallbackImage());
    }

    // Process the image (resize to 30x30 PNG, or serve ICO as-is)
    const processedBuffer = await processImage(
      buffer,
      imageUrl.toString(),
      contentType,
    );

    // Determine the correct content type for caching and response
    const isIco = isIcoFile(imageUrl.toString(), contentType);
    const responseContentType = isIco ? 'image/x-icon' : contentType;

    // Cache the result with correct content type
    await setToCacheBinary(cacheKey, processedBuffer, responseContentType);

    reply.header('Content-Type', responseContentType);
    reply.header('Cache-Control', 'public, max-age=3600, immutable');
    return reply.send(processedBuffer);
  } catch (error: any) {
    logger.error('Favicon fetch error', {
      error: error.message,
      url: request.query.url,
    });

    const message =
      process.env.NODE_ENV === 'production'
        ? 'Bad request'
        : (error?.message ?? 'Error');
    reply.header('Cache-Control', 'no-store');
    return reply.status(400).send(message);
  }
}

export async function clearFavicons(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const redis = getRedisCache();
  const keys = await redis.keys('favicon:*');

  // Delete both the binary data and content-type keys
  for (const key of keys) {
    await redis.del(key);
    await redis.del(`${key}:ctype`);
  }

  return reply.status(200).send('OK');
}

export async function clearOgImages(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const redis = getRedisCache();
  const keys = await redis.keys('og:*');

  // Delete both the binary data and content-type keys
  for (const key of keys) {
    await redis.del(key);
    await redis.del(`${key}:ctype`);
  }

  return reply.status(200).send('OK');
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

export async function getOgImage(
  request: FastifyRequest<{
    Querystring: {
      url: string;
    };
  }>,
  reply: FastifyReply,
) {
  try {
    const url = validateUrl(request.query.url);
    if (!url) {
      return getFavicon(request, reply);
    }
    const cacheKey = createCacheKey(url.toString(), 'og');

    // Check cache first
    const cached = await getFromCacheBinary(cacheKey);
    if (cached) {
      reply.header('Content-Type', cached.contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(cached.buffer);
    }

    let imageUrl: URL;

    // If it's a direct image URL, use it directly
    if (isDirectImage(url)) {
      imageUrl = url;
    } else {
      // For website URLs, extract OG image from HTML
      const meta = await parseUrlMeta(url.toString());
      if (meta?.ogImage) {
        imageUrl = new URL(meta.ogImage);
      } else {
        // No OG image found, return a fallback
        return getFavicon(request, reply);
      }
    }

    // Fetch the image
    const { buffer, contentType, status } = await fetchImage(imageUrl);

    if (status !== 200 || buffer.length === 0) {
      return getFavicon(request, reply);
    }

    // Process the image (resize to 1200x630 for OG standards, or serve as-is if reasonable size)
    const processedBuffer = await processOgImage(
      buffer,
      imageUrl.toString(),
      contentType,
    );

    // Cache the result
    await setToCacheBinary(cacheKey, processedBuffer, 'image/png');

    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=3600, immutable');
    return reply.send(processedBuffer);
  } catch (error: any) {
    logger.error('OG image fetch error', {
      error: error.message,
      url: request.query.url,
    });

    const message =
      process.env.NODE_ENV === 'production'
        ? 'Bad request'
        : (error?.message ?? 'Error');
    reply.header('Cache-Control', 'no-store');
    return reply.status(400).send(message);
  }
}
