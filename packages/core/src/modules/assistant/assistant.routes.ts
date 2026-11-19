import { defineRoutes } from '../../http/define';
import { getProjectAccess } from '../../shared/access-lookups';
import {
  getOrganizationByProjectIdCached,
  getSettingsForProject,
} from '../organization/organization.service';
import { getProjectById } from '../project/project.service';
import { zChatRequest } from './assistant.constants';
import { checkChatLimits, resolveChatTier } from './src/limits';

const TOO_MANY_REQUESTS = 429;

export const assistantRoutes = defineRoutes((app) =>
  app.post(
    '/ai/chat',
    async ({ body, session, status, request, ctx }) => {
      const userId = session.userId;
      if (!userId) {
        return status(401, { message: 'Sign in required' });
      }

      const parsed = zChatRequest.safeParse(body);
      if (!parsed.success) {
        return status(400, {
          message: 'Invalid chat request',
          issues: parsed.error.issues,
        });
      }
      const chat = parsed.data;

      const [access, organization, settings, project, conversation] =
        await Promise.all([
          getProjectAccess({ projectId: chat.projectId, userId }),
          getOrganizationByProjectIdCached(ctx, chat.projectId),
          getSettingsForProject(ctx, chat.projectId).catch(() => ({
            timezone: 'UTC',
          })),
          getProjectById(ctx, chat.projectId),
          ctx.services.conversation.getConversationById(chat.id),
        ]);
      if (
        !(access && organization && project) ||
        organization.id !== chat.organizationId
      ) {
        return status(403, { message: 'No access to this project' });
      }
      if (
        conversation &&
        (conversation.userId !== userId ||
          conversation.projectId !== chat.projectId)
      ) {
        return status(404, { message: 'Conversation not found' });
      }

      // Every request runs the model, including approval and client-tool
      // continuations; exempting any shape of body would let a crafted one through.
      const limited = await checkChatLimits(ctx, {
        organizationId: organization.id,
        userId,
        tier: resolveChatTier(organization, ctx.config.selfHosted),
      });
      if (limited) {
        return status(TOO_MANY_REQUESTS, limited);
      }

      return ctx.services.assistant.runChat({
        httpCtx: ctx,
        request: chat,
        userId,
        timezone: settings.timezone || 'UTC',
        projectName: project.name,
        abortSignal: request.signal,
      });
    },
    { session: true, detail: { hide: true } }
  )
);
