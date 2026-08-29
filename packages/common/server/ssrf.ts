import { assertPublicUrl } from './safe-fetch';

export { createPinnedLookup } from './safe-fetch';

/**
 * Guard a stored, tenant-supplied URL that we are about to connect to with a
 * client we don't control the transport of (the AWS SDK, a TLS probe). When the
 * request goes through `fetch`, prefer `safeFetch` from `./safe-fetch`: it pins
 * the socket and re-checks every redirect hop.
 *
 * Returns the validated addresses, or `null` when the check was skipped. The
 * caller MUST pin its connection to one of them (see `createPinnedLookup`):
 * validating alone is check-then-connect, and a client that re-resolves the
 * hostname itself can land somewhere else entirely if the DNS answer flips in
 * between (rebinding).
 *
 * Skipped on self-hosted deployments: there's a single tenant who already
 * controls the network, and reaching internal services (e.g. an internal MinIO
 * or webhook receiver) is a legitimate, pre-existing use. The guard exists to
 * stop cross-tenant SSRF on the managed/multi-tenant cloud.
 */
export async function assertSafeUrl(rawUrl: string): Promise<string[] | null> {
  // Compare explicitly: bare truthiness would treat SELF_HOSTED="false" as
  // self-hosted and silently drop the guard on the cloud.
  if (
    process.env.SELF_HOSTED === 'true' ||
    process.env.SELF_HOSTED === '1'
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  return assertPublicUrl(url);
}
