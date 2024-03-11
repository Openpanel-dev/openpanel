import type { FastifyRequest } from 'fastify';

import { logger } from './logger';

interface RemoteIpLookupResponse {
  country: string | undefined;
  city: string | undefined;
  stateprov: string | undefined;
  continent: string | undefined;
}

interface GeoLocation {
  country: string | undefined;
  city: string | undefined;
  region: string | undefined;
  continent: string | undefined;
}

const geo: GeoLocation = {
  country: undefined,
  city: undefined,
  region: undefined,
  continent: undefined,
};

const ignore = ['127.0.0.1', '::1'];

export function getClientIp(req: FastifyRequest) {
  if (req.headers['cf-connecting-ip']) {
    return String(req.headers['cf-connecting-ip']);
  }

  if (req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']);
  }

  return null;
}

export async function parseIp(ip?: string): Promise<GeoLocation> {
  if (!ip || ignore.includes(ip)) {
    return geo;
  }

  try {
    const geo = await fetch(`${process.env.GEO_IP_HOST}/${ip}`, {
      signal: AbortSignal.timeout(2000),
    });
    const res = (await geo.json()) as RemoteIpLookupResponse;

    return {
      country: res.country,
      city: res.city,
      region: res.stateprov,
      continent: res.continent,
    };
  } catch (e) {
    logger.error('Failed to fetch geo location for ip', e);
    return geo;
  }
}
