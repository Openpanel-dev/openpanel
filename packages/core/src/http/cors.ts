// The CORS delegator.
//
// Two halves, and BOTH are the contract:
//
// 1. `CORS_PRIVATE_PATHS` is the allowlist: a request under one of those
// prefixes is only allowed from a configured dashboard origin; everything
// else — `/track`, `/export`, `/insights`, `/import`, `/manage`, `/profile`,
// `/event`, `/tools` — is open to any origin. 2. `/gsc` and `/mcp` are
// dashboard-scope routes ABSENT from the list, and therefore open.
//
// The origins come from `apps/api`'s config, not from an environment read.
//
// On an open path that DOES send an `Origin` header, that origin is echoed
// back with `vary: Origin` and `access-control-allow-credentials: true`,
// rather than answering `*`. A browser treats an echoed origin plus `Vary`
// exactly as it treats `*`, so this permits the same set of cross-origin
// requests. A request with no `Origin` header — every server-side SDK, every
// golden replay — still gets `*`.

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
