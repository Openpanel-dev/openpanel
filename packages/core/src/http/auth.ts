// A macro authenticates the CALLER and stops. A missing authorization check is
// silent (a dropped access check returns 200 with somebody else's data), so the
// option-bearing macro types the resolved client onto the handler: a route that
// skips it has no `client` binding at all.

import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { toIngestHeaders } from '../shared/headers';
import { authenticateClient, type ClientAuthOptions } from './client-auth';
import { requestContext } from './context';

const UNAUTHORIZED = 401;
/** Allow-list routes answer a 401 with a JSON envelope; ingest routes with plain text. */
const UNAUTHORIZED_ERROR = 'Unauthorized';

/** The named plugin every module reaches through `defineRoutes`; it brings `requestContext(deps)` so a route cannot request a tier without its context. */
export function authMacros(deps: AppDeps) {
  return new Elysia({ name: 'core/auth-macros' })
    .use(requestContext(deps))
    .macro({
      session: {
        async resolve({ ctx, status }) {
          const session = await ctx.session();
          if (!session) {
            return status(401);
          }
          return { session };
        },
      },
      clientAuth: (options: ClientAuthOptions) => ({
        async resolve({ body, ctx, status }) {
          const result = await authenticateClient(
            ctx,
            toIngestHeaders(ctx.headers),
            options,
            { ip: ctx.ip, body }
          );
          if (!result.ok) {
            if (result.ingest) {
              ctx.logger.warn(
                { message: result.message },
                'Invalid SDK request'
              );
              return status(UNAUTHORIZED, result.message);
            }
            return status(UNAUTHORIZED, {
              error: UNAUTHORIZED_ERROR,
              message: result.message,
            });
          }
          return { client: result.client };
        },
      }),
    });
}
