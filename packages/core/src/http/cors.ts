// `CORS_PRIVATE_PATHS` is the allowlist: a request under one of those prefixes
// is only allowed from a configured dashboard origin; everything else (`/track`,
// `/export`, `/insights`, `/import`, `/manage`, `/profile`, `/event`, `/tools`)
// is open to any origin. `/gsc` and `/mcp` are absent from the list, and so open.
//
// On an open path that sends an `Origin`, that origin is echoed with
// `vary: Origin` and `access-control-allow-credentials: true` instead of `*`;
// browsers treat the two identically. A request with no `Origin` (every
// server-side SDK) still gets `*`.

import { cors } from '@elysiajs/cors';

/** The allowlist of private-route prefixes. */
export const CORS_PRIVATE_PATHS = [
  '/trpc',
  '/live',
  '/webhook',
  '/oauth',
  '/misc',
  '/ai',
] as const;

/** Preflight cache duration for the open paths (7 days). */
const CORS_MAX_AGE_SECONDS = 86_400 * 7;

export interface CorsOptions {
  /** `DASHBOARD_URL` plus `API_CORS_ORIGINS`, already split and filtered. */
  dashboardOrigins: string[];
}

export function corsDelegator({ dashboardOrigins }: CorsOptions) {
  const allowed = new Set(dashboardOrigins);

  return cors({
    origin: (request) => {
      const path = new URL(request.url).pathname;
      const isPrivatePath = CORS_PRIVATE_PATHS.some((prefix) =>
        path.startsWith(prefix)
      );

      if (!isPrivatePath) {
        return true;
      }

      const origin = request.headers.get('origin');
      return origin !== null && allowed.has(origin);
    },
    credentials: true,
    maxAge: CORS_MAX_AGE_SECONDS,
  });
}
