import type { IpHeaderConfig } from '../../config';
import { defineRoutes } from '../../http/define';
import { getTrustedIpFromHeaders } from '../../shared/get-client-ip';
import {
  AUTH_BASE_PATH,
  type Auth,
  TRUSTED_IP_HEADER,
} from './src/better-auth';

/** The part of Bun's server Elysia hands a route: the peer address. */
interface SocketAddressSource {
  requestIP(request: Request): { address: string } | null;
}

interface ForwardOptions {
  ipHeaders: IpHeaderConfig;
  socketIp: string | undefined;
  pathname?: string;
}

/**
 * better-auth's rate limiter keys on one header we set ourselves, so a caller
 * cannot pick its own bucket through `x-forwarded-for`.
 */
function withTrustedIp(
  request: Request,
  { ipHeaders, socketIp, pathname }: ForwardOptions
): Request {
  const url = new URL(request.url);
  if (pathname) {
    url.pathname = pathname;
  }
  const headers = new Headers(request.headers);
  const { ip } = getTrustedIpFromHeaders(ipHeaders, request.headers, socketIp);
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

function handle(
  auth: Auth | null,
  request: Request,
  options: ForwardOptions
): Promise<Response> | Response {
  if (!auth) {
    return new Response('Not Found', { status: 404 });
  }
  return auth.handler(withTrustedIp(request, options));
}

// The redirect URIs registered at Google and GitHub point at the legacy
// `/oauth/<provider>/callback` paths; serving them means nobody has to change
// their OAuth app.
export const authRoutes = defineRoutes((app, deps) => {
  const forward = (
    {
      request,
      server,
    }: { request: Request; server: SocketAddressSource | null },
    pathname?: string
  ) =>
    handle(deps.auth, request, {
      ipHeaders: deps.config.ipHeaders,
      socketIp: server?.requestIP(request)?.address,
      pathname,
    });
  const route = { parse: 'none', detail: { hide: true } } as const;
  return app
    .all(`${AUTH_BASE_PATH}/*`, (context) => forward(context), route)
    .get(
      '/oauth/google/callback',
      (context) => forward(context, `${AUTH_BASE_PATH}/callback/google`),
      route
    )
    .get(
      '/oauth/github/callback',
      (context) => forward(context, `${AUTH_BASE_PATH}/callback/github`),
      route
    );
});
