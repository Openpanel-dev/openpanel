import * as dns from 'node:dns/promises';
import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import { getGeoLocation } from '@openpanel/geo';
import { NextResponse } from 'next/server';

interface IPInfo {
  ip: string;
  location: {
    country: string | undefined;
    city: string | undefined;
    region: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
  };
  isp: string | null;
  asn: string | null;
  organization: string | null;
  hostname: string | null;
}

interface IPInfoResponse {
  ip: string;
  location: {
    country: string | undefined;
    city: string | undefined;
    region: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
  };
  isp: string | null;
  asn: string | null;
  organization: string | null;
  hostname: string | null;
  isLocalhost: boolean;
  isPrivate: boolean;
}

// Simple rate limiting (in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback
  if (ip === '::1') return true;
  if (ip.startsWith('::ffff:127.')) return true;

  // IPv4 loopback
  if (ip.startsWith('127.')) return true;

  // IPv4 private ranges
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = Number.parseInt(parts[1] || '0', 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }

  // IPv6 private ranges
  if (
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }

  return false;
}

async function getIPInfo(ip: string): Promise<IPInfo> {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return {
      ip,
      location: {
        country: undefined,
        city: undefined,
        region: undefined,
        latitude: undefined,
        longitude: undefined,
      },
      isp: null,
      asn: null,
      organization: null,
      hostname: null,
    };
  }

  // Get geolocation
  const geo = await getGeoLocation(ip);

  // Get ISP/ASN info
  let isp: string | null = null;
  let asn: string | null = null;
  let organization: string | null = null;

  if (!isPrivateIP(ip)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `https://ip-api.com/json/${ip}?fields=isp,as,org,query,reverse`,
        {
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data.status !== 'fail') {
          isp = data.isp || null;
          asn = data.as ? `AS${data.as.split(' ')[0]}` : null;
          organization = data.org || null;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Reverse DNS lookup for hostname
  let hostname: string | null = null;
  try {
    const hostnames = await dns.reverse(ip);
    hostname = hostnames[0] || null;
  } catch {
    // Ignore errors
  }

  return {
    ip,
    location: {
      country: geo.country,
      city: geo.city,
      region: geo.region,
      latitude: geo.latitude,
      longitude: geo.longitude,
    },
    isp,
    asn,
    organization,
    hostname,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ipParam = searchParams.get('ip');

  // Rate limiting
  const { ip: clientIp } = getClientIpFromHeaders(request.headers);
  if (clientIp && !checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    );
  }

  let ipToLookup: string;

  if (ipParam) {
    // Lookup provided IP
    ipToLookup = ipParam.trim();
  } else {
    // Auto-detect client IP
    ipToLookup = clientIp || '';
  }

  if (!ipToLookup) {
    return NextResponse.json(
      { error: 'No IP address provided or detected' },
      { status: 400 },
    );
  }

  // Validate IP format (basic check)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (!ipv4Regex.test(ipToLookup) && !ipv6Regex.test(ipToLookup)) {
    return NextResponse.json(
      { error: 'Invalid IP address format' },
      { status: 400 },
    );
  }

  try {
    const info = await getIPInfo(ipToLookup);
    const isLocalhost = ipToLookup === '127.0.0.1' || ipToLookup === '::1';
    const isPrivate = isPrivateIP(ipToLookup);

    const response: IPInfoResponse = {
      ...info,
      isLocalhost,
      isPrivate,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('IP lookup error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to lookup IP address',
      },
      { status: 500 },
    );
  }
}
