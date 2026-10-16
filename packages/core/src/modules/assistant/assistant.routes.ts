// `parse: 'none'` is load-bearing: the global request-logging hook references
// `body`, so Elysia would consume the stream before the handler runs and
// `request.clone` would throw "Body is disturbed or locked". With parsing off,
// the body is read via `request.clone` for the access check and
// `chatApp.handler` gets the original request to re-read itself.

import { defineRoutes } from '../../http/define';
import { getProjectAccess } from '../../shared/access-lookups';
import {
  getOrganizationByProjectIdCached,
  getSettingsForProject,
} from '../organization/organization.service';

const TITLER_AGENT_NAME = '__titler';

interface RunBody {
  conversationId?: string;
  context?: { projectId?: string; organizationId?: string };
}

function readRunBody(request: Request): Promise<RunBody | null> {
  return request
    .clone()
    .json()
    .catch(() => null) as Promise<RunBody | null>;
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

      // The store loads conversations by id alone, whatever the agent name.
      const isOwnConversation = async (conversationId: string) => {
        const conv =
          await ctx.services.conversation.getConversationById(conversationId);
        return !conv || conv.userId === userId;
      };

      // The titler has no project context, so it may only run statelessly:
      // any other route or a `conversationId` would load a conversation
      // without the ownership check below.
      if (agentName === TITLER_AGENT_NAME) {
        const isStatelessRun =
          request.method === 'POST' &&
          route === 'run' &&
          segments.length === 2 &&
          !(await readRunBody(request))?.conversationId;
        if (!isStatelessRun) {
          return status(404, { message: 'Not found' });
        }
        return chatApp.handler(request);
      }

      // A brand-new chat (no row yet) falls through to the agent handler,
      // whose `ConversationStore.load()` returns null.
      if (route === 'conversations' && routeId) {
        if (!(await isOwnConversation(routeId))) {
          return status(404, { message: 'Conversation not found' });
        }
        return chatApp.handler(request);
      }

      // Everything else (primarily `POST /:name/run`) is an active run and
      // must carry `context.projectId` + `context.organizationId`.
      const body = await readRunBody(request);
      if (
        body?.conversationId &&
        !(await isOwnConversation(body.conversationId))
      ) {
        return status(404, { message: 'Conversation not found' });
      }
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
