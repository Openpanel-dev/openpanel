// `CORS_OPERATOR_PATHS` (Basic-authenticated operator tooling) is readable
// from no other origin: a browser replays cached Basic credentials on a
// credentialed cross-origin request, so echoing the origin would hand a heap
// snapshot to any page. `CORS_PRIVATE_PATHS` is the allowlist: a request
// under one of those prefixes is only allowed from a configured dashboard
// origin; everything else (`/track`,
// `/export`, `/insights`, `/import`, `/manage`, `/profile`, `/event`, `/tools`)
// is open to any origin. `/gsc` and `/mcp` are absent from the list, and so open.
//
// On an open path that sends an `Origin`, that origin is echoed with
// `vary: Origin` and `access-control-allow-credentials: true` instead of `*`;
// browsers treat the two identically. A request with no `Origin` (every
// server-side SDK) still gets `*`.

import { cors } from '@elysiajs/cors';
import { BULL_BOARD_BASE_PATH } from './bull-board';
import { MEMORY_ROUTES_BASE_PATH } from './memory.routes';

const DEBUG_ROUTES_BASE_PATH = '/debug';

/** The allowlist of private-route prefixes. */
export const CORS_PRIVATE_PATHS = [
  '/trpc',
  '/api/auth',
  '/live',
  '/webhook',
  '/oauth',
  '/misc',
  '/ai',
] as const;

/** Operator-only prefixes: memory diagnostics, the queue board, dev debug routes. */
export const CORS_OPERATOR_PATHS = [
  MEMORY_ROUTES_BASE_PATH,
  BULL_BOARD_BASE_PATH,
  DEBUG_ROUTES_BASE_PATH,
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
      if (CORS_OPERATOR_PATHS.some((prefix) => path.startsWith(prefix))) {
        return false;
      }
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
