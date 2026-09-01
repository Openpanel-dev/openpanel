// Caller authentication, declared once and requested per route (ADR-011 A-i).
//
// A macro authenticates the CALLER and stops. Everything below it is preserved
// verbatim by whichever wave ports the router, and is listed here because a
// missing authorization check is silent: a broken chart throws, a dropped
// access check returns 200 with somebody else's data.
//
// ADR-011 A-iii invariants, binding:
//  1. Macros authenticate the caller only. A route or procedure holding a
//     reportId/dashboardId/cohortId/importId/referenceId/ruleId/insightId/
//     integrationId/conversationId/clientId does its own check in the handler.
//     Porting a router NEVER deletes an in-handler check.
//  2. `enforceAccess` triggers on the RAW pre-zod input, top-level keys only,
//     so `{projectId: null}` still reaches the project lookup and fails closed.
//  3. `needsWrite = mutation && !meta.readOnlyMutation`; the opt-out stays on
//     exactly `conversation.rename` and `overview.runFilterCommand`.
//  4. The organizationId check is membership only, never admin. The 12
//     `org:admin` gates stay hand-written.
//  5. `getProjectAccess`: zero ProjectAccess rows in the org => write; one row
//     anywhere in the org => every unlisted project is null; all exceptions
//     swallowed => null (fail-closed).
//  6. `canWriteProject` = level in {write, admin}; admin stays a superset.
//  7. 5-minute Redis cache + 60s in-process LRU on both access lookups;
//     removeMember/updateMemberAccess do not clear them. Sessions survive
//     revocation (docs/ANSWERS.md §3: acceptable).
//  8. The nine cross-object binding checks in DISC-011 §4.4.
//  9. chartProcedure's share branch overwrites the caller's projectId with the
//     report's — explicit in the builder, not an accident of spread order.
// 10. `/live/visitors/:projectId` stays unauthenticated; the other three /live
//     routes keep session + access, and all four keep reject-after-upgrade.
// 11. Invites stay bearer tokens: no invite.email vs user.email comparison.
// 12. `resolveClientProjectId` is the single client->project resolution point.
// 13. Public-API routes never see a session cookie, however the scopes compose.
//
// Elysia 1.4.30 carries the option-bearing macro shape, so ADR-011's
// `requireClient(ctx, opts)` fallback is NOT taken: `clientAuth: { allow: [...] }`
// types the resolved client onto the handler, and a route that does not request
// the macro has no `client` binding at all — "did this route authenticate?" is
// a type question. Verified by http/auth.test.ts and by `tsc --noEmit`.

import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { authenticateClient, type ClientAuthOptions } from './client-auth';
import { requestContext } from './context';

const INVALID_CLIENT_MESSAGE = 'Invalid client credentials';

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
        async resolve({ ctx, status }) {
          const client = await authenticateClient(deps, ctx.headers, options);
          if (!client) {
            return status(401, INVALID_CLIENT_MESSAGE);
          }
          return { client };
        },
      }),
    });
}
