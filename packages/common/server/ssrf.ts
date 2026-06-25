import { assertPublicUrl } from './safe-fetch';

/**
 * Guard a stored, tenant-supplied URL that we are about to connect to with a
 * client we don't control the transport of (the AWS SDK, a TLS probe). When the
 * request goes through `fetch`, prefer `safeFetch` from `./safe-fetch`: it pins
 * the socket to the address it validated and re-checks every redirect hop,
 * neither of which is possible from the outside.
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

  await assertPublicUrl(url);
}
