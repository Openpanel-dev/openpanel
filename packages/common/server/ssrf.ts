import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Block a resolved IP that targets internal/reserved space — loopback, private
 * ranges, CGNAT, and link-local (which includes the cloud metadata endpoint
 * 169.254.169.254). Anything that isn't a valid public IP is blocked.
 */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) // private
  );
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') {
    return true; // loopback / unspecified
  }
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    return isBlockedIpv4(mapped[1]!); // IPv4-mapped
  }
  return (
    lower.startsWith('fc') || // unique-local fc00::/7
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower) // link-local fe80::/10
  );
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return isBlockedIpv4(ip);
  }
  if (family === 6) {
    return isBlockedIpv6(ip);
  }
  return true; // not a parseable IP → block
}

/**
 * SSRF guard for tenant-controlled URLs (webhooks, custom S3 endpoints). Rejects
 * non-HTTP(S) schemes and any host that resolves to internal/reserved address
 * space, before a connection is made.
 *
 * Skipped on self-hosted deployments: there's a single tenant who already
 * controls the network, and reaching internal services (e.g. an internal MinIO
 * or webhook receiver) is a legitimate, pre-existing use. The guard exists to
 * stop cross-tenant SSRF on the managed/multi-tenant cloud.
 *
 * Note: DNS is resolved here and again by the client, so a deliberate DNS-rebind
 * between the two is not covered; this stops the common cases (literal
 * private/metadata URLs and hostnames pointing at internal IPs).
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  if (process.env.SELF_HOSTED) {
    return;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  const resolved = await lookup(url.hostname, { all: true });
  if (
    resolved.length === 0 ||
    resolved.some((r) => isBlockedAddress(r.address))
  ) {
    throw new Error('URL resolves to a disallowed address');
  }
}
