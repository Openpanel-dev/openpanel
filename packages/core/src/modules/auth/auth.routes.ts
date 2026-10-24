import { defineRoutes } from '../../http/define';
import { getTrustedIpFromHeaders } from '../../shared/get-client-ip';
import {
  AUTH_BASE_PATH,
  type Auth,
  TRUSTED_IP_HEADER,
} from './src/better-auth';

const TRUSTED_ONLY = { attributionOrder: undefined, trustedOrder: undefined };

/**
 * better-auth's rate limiter keys on one header we set ourselves, so a caller
 * cannot pick its own bucket through `x-forwarded-for`.
 */
function withTrustedIp(request: Request, pathname?: string): Request {
  const url = new URL(request.url);
  if (pathname) {
    url.pathname = pathname;
  }
  const headers = new Headers(request.headers);
  const { ip } = getTrustedIpFromHeaders(TRUSTED_ONLY, request.headers);
  headers.delete(TRUSTED_IP_HEADER);
  if (ip) {
    headers.set(TRUSTED_IP_HEADER, ip);
  }
  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
}

function handle(auth: Auth | null, request: Request, pathname?: string) {
  if (!auth) {
    return new Response('Not Found', { status: 404 });
  }
  return auth.handler(withTrustedIp(request, pathname));
}

// The redirect URIs registered at Google and GitHub point at the legacy
// `/oauth/<provider>/callback` paths; serving them means nobody has to change
// their OAuth app.
export const authRoutes = defineRoutes((app, deps) =>
  app
    .all(`${AUTH_BASE_PATH}/*`, ({ request }) => handle(deps.auth, request), {
      parse: 'none',
      detail: { hide: true },
    })
    .get(
      '/oauth/google/callback',
      ({ request }) =>
        handle(deps.auth, request, `${AUTH_BASE_PATH}/callback/google`),
      { parse: 'none', detail: { hide: true } }
    )
    .get(
      '/oauth/github/callback',
      ({ request }) =>
        handle(deps.auth, request, `${AUTH_BASE_PATH}/callback/github`),
      { parse: 'none', detail: { hide: true } }
    )
);
