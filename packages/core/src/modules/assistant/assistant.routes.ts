// Better Agent chat, mounted under `/ai/agents/*` (M5-005) inside
// `dashboardRoutes` (rest.routes.ts), which `apps/api/src/main.ts` mounts.
//
// Elysia has no adapter in `@better-agent/adapters` (only express/fastify),
// but `BetterAgentApp.handler` already speaks the Web `Request`/`Response`
// pair Elysia's own handlers do, so this route calls it directly instead of
// waiting on one. `parse: 'none'` is load-bearing, as on the /trpc mount in
// apps/api/src/main.ts: the global request-logging hook references `body`,
// which makes Elysia infer body parsing for every route and consume the
// stream before the handler runs; `request.clone()` then throws "Body is
// disturbed or locked". With parsing off, the body is read via
// `request.clone()` for the project-access check below and `chatApp.handler`
// gets the original, unconsumed `request` so it can re-read it itself.
//
// M15-003: this route is where `deps` lives, so everything below it reaches
// Postgres/ClickHouse through `ctx` — the chat app, the conversation lookup
// and the access check included. That is what removed the four lazy loaders
// this file used to open with (ADR-022 R6).

import { defineRoutes } from '../../http/define';
import { getProjectAccess } from '../../shared/access-lookups';
import {
  getOrganizationByProjectIdCached,
  getSettingsForProject,
} from '../organization/organization.service';

interface RunBody {
  context?: { projectId?: string; organizationId?: string };
}

export const assistantRoutes = defineRoutes((app) =>
  app.all(
    '/ai/agents/*',
    async ({ params, session, status, request, ctx }) => {
      const userId = session.userId;
      if (!userId) {
        return status(401, { message: 'Sign in required' });
      }

      const chatApp = ctx.services.assistant.getChatApp();
      const chatRunContext = ctx.services.assistant.getChatRunContext();

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
        const conv =
          await ctx.services.conversation.getConversationById(routeId);
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

      const [access, organization, settings] = await Promise.all([
        getProjectAccess({ projectId, userId }),
        getOrganizationByProjectIdCached(ctx, projectId),
        getSettingsForProject(ctx, projectId).catch(() => ({
          timezone: 'UTC',
        })),
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
    { session: true, detail: { hide: true }, parse: 'none' }
  )
);
