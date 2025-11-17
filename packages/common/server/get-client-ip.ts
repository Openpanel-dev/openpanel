/**
 * Get client IP from headers
 *
 * Can be configured via IP_HEADER_ORDER env variable
 * Example: IP_HEADER_ORDER="cf-connecting-ip,x-real-ip,x-forwarded-for"
 */

export const DEFAULT_IP_HEADER_ORDER = [
  'openpanel-client-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'x-forwarded-for',
  'x-real-ip',
  'fastly-client-ip',
  'x-cluster-client-ip',
  'x-appengine-user-ip',
  'do-connecting-ip',
  'x-nf-client-connection-ip',
  'x-forwarded',
  'forwarded',
];

function isPublicIp(ip: string): boolean {
  return (
    !ip.startsWith('10.') &&
    !ip.startsWith('172.16.') &&
    !ip.startsWith('192.168.')
  );
}

function getHeaderOrder(): string[] {
  if (typeof process !== 'undefined' && process.env?.IP_HEADER_ORDER) {
    return process.env.IP_HEADER_ORDER.split(',').map((h) => h.trim());
  }
  return DEFAULT_IP_HEADER_ORDER;
}

function isValidIp(ip: string): boolean {
  // Basic IP validation
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return isPublicIp(ip) && (ipv4.test(ip) || ipv6.test(ip));
}

export function getClientIpFromHeaders(
  headers: Record<string, string | string[] | undefined> | Headers,
  overrideHeaderName?: string,
): {
  ip: string;
  header: string;
} {
  let headerOrder = getHeaderOrder();

  if (overrideHeaderName) {
    headerOrder = [overrideHeaderName];
  }

  for (const headerName of headerOrder) {
    let value: string | null = null;

    // Get header value
    if (headers instanceof Headers) {
      value = headers.get(headerName);
    } else {
      const headerValue = headers[headerName];
      if (Array.isArray(headerValue)) {
        value = headerValue[0] || null;
      } else {
        value = headerValue || null;
      }
    }

    if (!value) continue;

    // Handle x-forwarded-for (comma separated)
    if (headerName === 'x-forwarded-for') {
      const firstIp = value.split(',')[0]?.trim();
      if (firstIp && isValidIp(firstIp)) {
        return { ip: firstIp, header: headerName };
      }
    }
    // Handle forwarded header (RFC 7239)
    else if (headerName === 'forwarded') {
      const match = value.match(/for=(?:"?\[?([^\]"]+)\]?"?)/i);
      const ip = match?.[1];
      if (ip && isValidIp(ip)) {
        return { ip, header: headerName };
      }
    }
    // Regular headers
    else if (isValidIp(value)) {
      return { ip: value, header: headerName };
    }
  }

  return { ip: '', header: '' };
}
