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

interface GeoLocation {
  country: string | undefined;
  city: string | undefined;
  region: string | undefined;
  longitude: number | undefined;
  latitude: number | undefined;
}

const geo: GeoLocation = {
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
      longitude: res.longitude,
      latitude: res.latitude,
    };
  } catch (e) {
    logger.error('Failed to fetch geo location for ip', e);
    return geo;
  }
}
