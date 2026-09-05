// The CORS delegator, ported from apps/api/src/app.ts:107-131 (ADR-002
// "behaviour that must be preserved explicitly" 4).
//
// Two halves, and BOTH are the contract:
//
//  1. `CORS_PRIVATE_PATHS` is V1's `corsPaths` allowlist verbatim. A request
//     under one of those prefixes is only allowed from a configured dashboard
//     origin; everything else — `/track`, `/export`, `/insights`, `/import`,
//     `/manage`, `/profile`, `/event`, `/tools` — is open to any origin.
//  2. The quirk that `/gsc` and `/mcp` are dashboard-scope routes ABSENT from
//     the list, and therefore open. Ported, not fixed.
//
// The origins come from `apps/api`'s config, not from `process.env`: core
// reads no environment.
//
// ONE deliberate delta from V1, forced by the plugin substitution ADR-002
// mandates (`@fastify/cors`'s per-request delegate -> `@elysiajs/cors`, whose
// `credentials` and `maxAge` are static while only `origin` is per-request):
// on an open path that DOES send an `Origin` header, V2 echoes that origin
// with `vary: Origin` where V1 answered `*`, and carries
// `access-control-allow-credentials: true`. Both forms permit exactly the same
// set of cross-origin requests; a browser treats an echoed origin plus `Vary`
// as it treats `*`. A request with no `Origin` header — every server-side SDK,
// every golden replay — still gets `*`.

import { cors } from '@elysiajs/cors';

/** V1's `corsPaths` (apps/api/src/app.ts:111), byte-for-byte. */
export const CORS_PRIVATE_PATHS = [
  '/trpc',
  '/live',
  '/webhook',
  '/oauth',
  '/misc',
  '/ai',
] as const;

/** V1's `maxAge: 86_400 * 7` on the open paths. */
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
