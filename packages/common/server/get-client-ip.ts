/**
 * Get client IP from headers
 *
 * Can be configured via IP_HEADER_ORDER env variable
 * Example: IP_HEADER_ORDER="cf-connecting-ip,x-real-ip,x-forwarded-for"
 */

// Order matters: client-forwarded headers (set explicitly by SDKs/upstream
// servers) must come before infrastructure headers like `cf-connecting-ip`.
// Otherwise, when our API sits behind Cloudflare (orange cloud), Cloudflare
// rewrites `cf-connecting-ip` to the SDK server's IP — losing the original
// end-user IP that the SDK forwarded in `x-client-ip` / `openpanel-client-ip`.
export const DEFAULT_IP_HEADER_ORDER = [
  'openpanel-client-ip',
  'true-client-ip',
  'x-client-ip',
  'cf-connecting-ip',
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
  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    const ipv4Part = ip.substring(7); // Extract IPv4 part after "::ffff:"
    return isPublicIp(ipv4Part); // Recursively check the IPv4 address
  }

  // IPv6 loopback
  if (ip === '::1') {
    return false;
  }

  // IPv6 private ranges (fc00::/7 and fe80::/10)
  if (
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:') ||
    ip.startsWith('fe80:')
  ) {
    return false;
  }

  // IPv4 loopback (127.0.0.0/8)
  if (ip.startsWith('127.')) {
    return false;
  }

  // IPv4 private ranges
  // 10.0.0.0/8
  if (ip.startsWith('10.')) {
    return false;
  }
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = Number.parseInt(parts[1] || '0', 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return false;
      }
    }
  }
  // 192.168.0.0/16
  if (ip.startsWith('192.168.')) {
    return false;
  }
  // 169.254.0.0/16 (link-local)
  if (ip.startsWith('169.254.')) {
    return false;
  }

  return true;
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

/**
 * Headers that may be trusted for *security* decisions (rate limiting,
 * blocking, abuse tracking).
 *
 * `getClientIpFromHeaders` above deliberately prefers client-forwarded
 * headers (`openpanel-client-ip`, `x-client-ip`, `x-forwarded-for`) because an
 * SDK running on a customer's server forwards the end-user IP that way. That
 * trust is correct for analytics attribution and fatal for rate limiting:
 * anyone can send `x-client-ip: <random>` on every request and get an endless
 * supply of fresh buckets.
 *
 * This order only contains headers written by infrastructure we sit behind.
 * Cloudflare overwrites `cf-connecting-ip` on every request, so a forged value
 * never survives the edge. `x-real-ip` is written by the reverse proxy for
 * self-hosters running without Cloudflare.
 */
export const TRUSTED_IP_HEADER_ORDER = [
  'cf-connecting-ip',
  'x-real-ip',
  'x-forwarded-for',
];

/**
 * Resolve the client IP for security decisions. Never returns an IP a client
 * could have picked for itself.
 *
 * The order can be narrowed per deployment with `TRUSTED_IP_HEADER_ORDER`
 * (comma separated) - set it to the single header your edge guarantees.
 */
export function getTrustedIpFromHeaders(
  headers: Record<string, string | string[] | undefined> | Headers,
  socketIp?: string,
): { ip: string; header: string } {
  const headerOrder = process.env.TRUSTED_IP_HEADER_ORDER
    ? process.env.TRUSTED_IP_HEADER_ORDER.split(',').map((h) => h.trim())
    : TRUSTED_IP_HEADER_ORDER;

  for (const headerName of headerOrder) {
    let value: string | null = null;

    if (headers instanceof Headers) {
      value = headers.get(headerName);
    } else {
      const headerValue = headers[headerName];
      value = (Array.isArray(headerValue) ? headerValue[0] : headerValue) || null;
    }

    if (!value) continue;

    // A proxy chain appends as it goes, so the *last* entry is the one written
    // by the hop closest to us - the only entry a client cannot forge. This is
    // the opposite of what `getClientIpFromHeaders` wants, which is why the two
    // functions do not share this branch.
    const candidate =
      headerName === 'x-forwarded-for'
        ? value.split(',').pop()?.trim()
        : value.trim();

    if (candidate && isValidIp(candidate)) {
      return { ip: candidate, header: headerName };
    }
  }

  // Direct connection (local dev, or an edge that strips everything). The
  // socket address is by definition not client-controlled, so it is safe to
  // use even when private.
  if (socketIp) {
    return { ip: socketIp, header: 'socket' };
  }

  return { ip: '', header: '' };
}
