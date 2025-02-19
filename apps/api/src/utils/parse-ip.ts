import crypto from 'node:crypto';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyRequest } from 'fastify';
import requestIp from 'request-ip';
import { logger } from './logger';

interface RemoteIpLookupResponse {
  country: string | undefined;
  city: string | undefined;
  stateprov: string | undefined;
  longitude: number | undefined;
  latitude: number | undefined;
}

export interface GeoLocation {
  country: string | undefined;
  city: string | undefined;
  region: string | undefined;
  longitude: number | undefined;
  latitude: number | undefined;
}

const DEFAULT_GEO: GeoLocation = {
  country: undefined,
  city: undefined,
  region: undefined,
  longitude: undefined,
  latitude: undefined,
};

const ignore = ['127.0.0.1', '::1'];

export function getClientIp(req: FastifyRequest) {
  return requestIp.getClientIp(req);
}

export async function parseIp(ip?: string): Promise<GeoLocation> {
  if (!ip || ignore.includes(ip)) {
    return DEFAULT_GEO;
  }

  const hash = crypto.createHash('sha256').update(ip).digest('hex');
  const cached = await getRedisCache()
    .get(`geo:${hash}`)
    .catch(() => {
      logger.warn('Failed to get geo location from cache', { hash });
      return null;
    });

  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const res = await fetch(`${process.env.GEO_IP_HOST}/${ip}`, {
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return DEFAULT_GEO;
    }

    const json = (await res.json()) as RemoteIpLookupResponse;

    const geo = {
      country: json.country,
      city: json.city,
      region: json.stateprov,
      longitude: json.longitude,
      latitude: json.latitude,
    };

    await getRedisCache().set(
      `geo:${hash}`,
      JSON.stringify(geo),
      'EX',
      60 * 60 * 24,
    );

    return geo;
  } catch (error) {
    logger.error('Failed to fetch geo location for ip', { error });
    return DEFAULT_GEO;
  }
}
