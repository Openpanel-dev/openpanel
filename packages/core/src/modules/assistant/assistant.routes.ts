// Better Agent chat, mounted under `/ai/agents/*` (M5-005). V1's inline
// Fastify wrapper (apps/api/src/app.ts:223-345) stays the LIVE route
// (DELEGATE PATTERN) and already calls `chatApp`/`chatRunContext` via
// `@openpanel/core`'s lazy getters — this route exists to satisfy the module
// map ("H") and to serve core's own (not yet live) `dashboardRoutes`.
//
// NAMED GAP, same as gsc.routes.ts / import.routes.ts: this route is not yet
// reachable. `resolveSession` (http/session.ts) is a P2 stub that always
// returns `null`, so the `session` macro 401s every request; main.ts also
// does not mount `dashboardRoutes` until a real `AppDeps` exists.
//
// Elysia has no adapter in `@better-agent/adapters` (only express/fastify),
// but `BetterAgentApp.handler` already speaks the Web `Request`/`Response`
// pair Elysia's own handlers do, so this route calls it directly instead of
// waiting on one. The request body is read via `request.clone()` for the
// project-access check below — `chatApp.handler` gets the original,
// unconsumed `request` so it can re-read the body itself.
//
// Everything below is dynamically imported, not statically — index.ts's
// header explains why a static import of `@openpanel/db` or
// `./assistant.service` here would race `@openpanel/db`'s own circular
// `buffers/base-buffer.ts` -> `@openpanel/core` import.

import { defineRoutes } from '../../http/define';

function loadDb() {
  return import('@openpanel/db');
}
function loadAssistant() {
  return import('./assistant.service');
}

interface RunBody {
  context?: { projectId?: string; organizationId?: string };
}

export const assistantRoutes = defineRoutes((app) =>
  app.all(
    '/ai/agents/*',
    async ({ params, session, status, request }) => {
      const userId = session.userId;
      if (!userId) {
        return status(401, { message: 'Sign in required' });
      }

      const { chatApp, chatRunContext } = await loadAssistant();

      // Parse the URL tail that comes after `/ai/agents/`. Examples:
      //   "claude-sonnet-4-5/run"               → run
      //   "claude-sonnet-4-5/conversations/abc"  → load conversation
      //   "__titler/run"                          → title stream (no project context)
      const wildcard = params['*'] ?? '';
      const segments = wildcard.split('/').filter(Boolean);
      const agentName = segments[0] ?? '';
      const route = segments[1] ?? '';
      const routeId = segments[2] ?? '';

      // The internal `__titler` agent has no project context — skip the
      // access check; session auth is enough.
      if (agentName === '__titler') {
        return chatApp.handler(request);
      }

      // Conversation hydration: verify ownership if the row already exists.
      // A brand-new chat (no row yet) falls through to the agent handler,
      // whose `ConversationStore.load()` returns null.
      if (route === 'conversations' && routeId) {
        const { getConversationById } = await loadDb();
        const conv = await getConversationById(routeId);
        if (conv && conv.userId !== userId) {
          return status(404, { message: 'Conversation not found' });
        }
        return chatApp.handler(request);
      }

      // Everything else (primarily `POST /:name/run`) is an active run and
      // must carry `context.projectId` + `context.organizationId`.
      const body = (await request
        .clone()
        .json()
        .catch(() => null)) as RunBody | null;
      const projectId = body?.context?.projectId;
      const organizationIdFromBody = body?.context?.organizationId;

      if (!(projectId && organizationIdFromBody)) {
        return status(400, {
          message: 'Missing projectId or organizationId in context',
        });
      }

      const {
        getOrganizationByProjectIdCached,
        getProjectAccess,
        getSettingsForProject,
      } = await loadDb();
      const [access, organization, settings] = await Promise.all([
        getProjectAccess({ projectId, userId }),
        getOrganizationByProjectIdCached(projectId),
        getSettingsForProject(projectId).catch(() => ({ timezone: 'UTC' })),
      ]);
      if (
        !(access && organization) ||
        organization.id !== organizationIdFromBody
      ) {
        return status(403, { message: 'No access to this project' });
      }

      return chatRunContext.run(
        {
          userId,
          projectId,
          organizationId: organization.id,
          timezone: settings.timezone || 'UTC',
        },
        () => chatApp.handler(request)
      );
    },
    { session: true, detail: { hide: true } }
  )
);
