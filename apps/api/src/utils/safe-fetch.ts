import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * SSRF guard for the endpoints that fetch user-supplied URLs (the favicon/OG
 * proxy and the public site checker).
 *
 * Two things have to be true for the guard to hold:
 *
 * 1. Every address a hostname resolves to must be publicly routable. Checking
 *    only the first A record lets an attacker publish a second AAAA record.
 * 2. The socket must connect to the address we validated. Resolving and then
 *    handing the hostname to `fetch` re-resolves it, so a DNS rebind between
 *    the two lookups reaches the internal target anyway. We pin the validated
 *    address into the connection instead.
 *
 * Redirects are followed manually so every hop goes through the same checks.
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/**
 * ipaddr.js range names that are not publicly routable. `unicast` is the only
 * range we accept; this list is spelled out so the intent is reviewable.
 */
const BLOCKED_RANGES = new Set([
  'unspecified', // 0.0.0.0/8, ::
  'broadcast', // 255.255.255.255
  'multicast', // 224.0.0.0/4, ff00::/8
  'linkLocal', // 169.254.0.0/16 (cloud metadata), fe80::/10
  'loopback', // 127.0.0.0/8, ::1
  'private', // 10/8, 172.16/12, 192.168/16
  'uniqueLocal', // fc00::/7
  'carrierGradeNat', // 100.64.0.0/10
  'reserved', // 192.0.0.0/24, 198.18/15, 240/4, 2001::/32, ...
  'benchmarking',
  'as112',
  'amt',
  'rfc6052', // 64:ff9b::/96
  'rfc6145',
  'teredo',
  '6to4', // 2002::/16
]);

export function isBlockedIp(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    // Unparseable means we cannot prove it is safe.
    return true;
  }

  // ::ffff:127.0.0.1 and friends must be judged as the IPv4 address they carry.
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return isBlockedIp(v6.toIPv4Address().toString());
    }
  }

  return BLOCKED_RANGES.has(parsed.range());
}

/**
 * Resolve a hostname, rejecting it entirely if any address is non-public.
 */
async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  // WHATWG URL keeps the brackets around IPv6 literals ("[::1]").
  const host =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;

  // A bare IP in the URL never hits DNS, so check it directly.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      throw new BlockedUrlError(`Refusing to connect to ${host}`);
    }
    return [host];
  }

  let addresses: { address: string }[];
  try {
    // `lookup` rather than `resolve4`/`resolve6` so /etc/hosts and the system
    // resolver are honoured the same way the real connection would.
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError(`Could not resolve ${host}`);
  }

  if (addresses.length === 0) {
    throw new BlockedUrlError(`Could not resolve ${host}`);
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new BlockedUrlError(
        `Refusing to connect to ${host} (resolves to a non-public address)`,
      );
    }
  }

  return addresses.map((entry) => entry.address);
}

/**
 * Validate a URL's scheme and destination without fetching it. Use this to
 * guard non-fetch outbound connections (raw TCP, TLS handshakes).
 * Throws {@link BlockedUrlError} when the URL must not be requested.
 */
export async function assertPublicUrl(url: URL): Promise<string[]> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http/https URLs are allowed');
  }
  return resolvePublicAddresses(url.hostname);
}

/** Validate a bare hostname (no URL available), e.g. before a TLS probe. */
export async function assertPublicHostname(
  hostname: string,
): Promise<string[]> {
  return resolvePublicAddresses(hostname);
}

/**
 * A dispatcher that only ever connects to `address`, so the socket cannot end
 * up somewhere other than the address we just validated.
 */
function createPinnedAgent(address: string): Agent {
  const family = net.isIPv6(address) ? 6 : 4;
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          (callback as unknown as (
            err: null,
            addresses: { address: string; family: number }[],
          ) => void)(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      },
    },
  });
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  method?: string;
  /** Abort the whole chain after this many milliseconds. */
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * When false, a 3xx is returned as-is instead of being followed. Callers
   * that walk the chain themselves still get per-hop validation and pinning.
   */
  followRedirects?: boolean;
  /** Reject responses whose body exceeds this many bytes. */
  maxBytes?: number;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
  /** Every URL that was requested, in order, with the status it returned. */
  chain: { url: string; status: number }[];
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5_000_000;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        throw new BlockedUrlError('Response exceeded the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => {
      // best effort
    });
  }

  return Buffer.concat(chunks);
}

/**
 * `fetch` with SSRF protection: every hop is resolved, checked and pinned to
 * the validated address, and the body is read under a size cap.
 * Throws {@link BlockedUrlError} if any hop points somewhere non-public.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const followRedirects = options.followRedirects ?? true;
  const maxRedirects = followRedirects
    ? (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)
    : 0;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const chain: { url: string; status: number }[] = [];

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    let current = input instanceof URL ? input : new URL(input);

    for (let hop = 0; ; hop++) {
      const [address] = await assertPublicUrl(current);
      const agent = createPinnedAgent(address!);

      let status: number;
      let headers: Headers;
      let body: Buffer;
      let location: string | null;

      try {
        const response = await undiciFetch(current, {
          method: options.method ?? 'GET',
          headers: options.headers,
          signal: controller.signal,
          // Handled below so every hop is re-validated.
          redirect: 'manual',
          dispatcher: agent,
        });

        status = response.status;
        headers = response.headers as unknown as Headers;
        location = response.headers.get('location');

        if (followRedirects && REDIRECT_STATUS.has(status) && location) {
          await response.body?.cancel().catch(() => {
            // best effort
          });
          body = Buffer.alloc(0);
        } else {
          body = await readBodyWithLimit(
            response.body as ReadableStream<Uint8Array> | null,
            maxBytes,
          );
        }
      } finally {
        await agent.close().catch(() => {
          // best effort
        });
      }

      chain.push({ url: current.toString(), status });

      if (!(followRedirects && REDIRECT_STATUS.has(status) && location)) {
        return { status, headers, body, finalUrl: current.toString(), chain };
      }

      if (hop >= maxRedirects) {
        throw new BlockedUrlError('Too many redirects');
      }

      try {
        current = new URL(location, current);
      } catch {
        throw new BlockedUrlError('Invalid redirect location');
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
