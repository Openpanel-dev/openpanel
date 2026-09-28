// Ported verbatim from apps/api/src/controllers/tools.controller.ts's
// `ipLookup`.

import { getGeoLocation } from '../../../clients/geo';
import type { CoreConfig } from '../../../config';
import type { Logger } from '../../../logger';
import { getClientIpFromHeaders } from '../../../shared/get-client-ip';
import { checkRateLimit } from './rate-limit';

const IP_LOOKUP_WINDOW_MS = 60 * 1000;
const IP_LOOKUP_MAX = 20;

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

export interface IpLookupResult {
  ip: string;
  location: {
    country: string | undefined;
    city: string | undefined;
    region: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
  };
  isLocalhost: boolean;
  isPrivate: boolean;
}

export type IpLookupOutcome =
  | { status: 200; result: IpLookupResult }
  | { status: 400 | 429 | 500; error: string };

function isPrivateIP(ip: string): boolean {
  if (ip === '::1') {
    return true;
  }
  if (ip.startsWith('::ffff:127.')) {
    return true;
  }
  if (ip.startsWith('127.')) {
    return true;
  }
  if (ip.startsWith('10.')) {
    return true;
  }
  if (ip.startsWith('192.168.')) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = Number.parseInt(parts[1] || '0', 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  if (
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }
  return false;
}

export async function runIpLookup(
  config: CoreConfig,
  ipParam: string | undefined,
  headers: Record<string, string | string[] | undefined> | Headers,
  logger?: Pick<Logger, 'error'>
): Promise<IpLookupOutcome> {
  const { ip: clientIp } = getClientIpFromHeaders(config.ipHeaders, headers);
  if (
    clientIp &&
    !checkRateLimit(`ip:${clientIp}`, IP_LOOKUP_WINDOW_MS, IP_LOOKUP_MAX)
  ) {
    return {
      status: 429,
      error: 'Rate limit exceeded. Please try again later.',
    };
  }

  const ipToLookup = ipParam ? ipParam.trim() : clientIp || '';

  if (!ipToLookup) {
    return { status: 400, error: 'No IP address provided or detected' };
  }

  if (!(IPV4_REGEX.test(ipToLookup) || IPV6_REGEX.test(ipToLookup))) {
    return { status: 400, error: 'Invalid IP address format' };
  }

  try {
    const geo = await getGeoLocation(ipToLookup);
    return {
      status: 200,
      result: {
        ip: ipToLookup,
        location: {
          country: geo.country,
          city: geo.city,
          region: geo.region,
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
        isLocalhost: ipToLookup === '127.0.0.1' || ipToLookup === '::1',
        isPrivate: isPrivateIP(ipToLookup),
      },
    };
  } catch (error) {
    logger?.error({ err: error }, 'IP lookup error');
    return {
      status: 500,
      error:
        error instanceof Error ? error.message : 'Failed to lookup IP address',
    };
  }
}
