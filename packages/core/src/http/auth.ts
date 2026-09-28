// Caller authentication, declared once and requested per route. A macro
// authenticates the CALLER and stops — a missing authorization check is
// silent: a broken chart throws, a dropped access check returns 200 with
// somebody else's data.
//
// Elysia's option-bearing macro shape makes `clientAuth: { allow: [...] }`
// type the resolved client onto the handler, so a route that skips the
// macro has no `client` binding at all — "did this route authenticate?" is
// a type question, verified by http/auth.test.ts and `tsc --noEmit`.

import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { toIngestHeaders } from '../shared/headers';
import { authenticateClient, type ClientAuthOptions } from './client-auth';
import { requestContext } from './context';

const UNAUTHORIZED = 401;
/** Allow-list routes answer a 401 with a JSON envelope; ingest routes answer
 *  with the refusal message as plain text — both forms are intentional. */
const UNAUTHORIZED_ERROR = 'Unauthorized';

/**
 * The named plugin every module reaches through `defineRoutes`. It brings
 * `requestContext(deps)` with it, so `ctx` and the tiers arrive together and a
 * route cannot request a tier without the context that resolves it.
 */
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
