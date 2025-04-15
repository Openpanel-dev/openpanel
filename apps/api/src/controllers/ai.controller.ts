import { getChatModel, getChatSystemPrompt } from '@/utils/ai';
import {
  getAllEventNames,
  getConversionReport,
  getFunnelReport,
  getProfile,
  getProfiles,
  getReport,
} from '@/utils/ai-tools';
import { HttpError } from '@/utils/errors';
import { db, getOrganizationByProjectIdCached } from '@openpanel/db';
import { getProjectAccessCached } from '@openpanel/trpc/src/access';
import { type Message, appendResponseMessages, streamText } from 'ai';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function chat(
  request: FastifyRequest<{
    Querystring: {
      projectId: string;
    };
    Body: {
      messages: Message[];
    };
  }>,
  reply: FastifyReply,
) {
  const { session } = request.session;
  const { messages } = request.body;
  const { projectId } = request.query;

  if (!session?.userId) {
    return reply.status(401).send('Unauthorized');
  }

  if (!projectId) {
    return reply.status(400).send('Missing projectId');
  }

  const organization = await getOrganizationByProjectIdCached(projectId);
  const access = await getProjectAccessCached({
    projectId,
    userId: session.userId,
  });

  if (!organization) {
    throw new HttpError('Organization not found', {
      status: 404,
    });
  }

  if (!access) {
    throw new HttpError('You are not allowed to access this project', {
      status: 403,
    });
  }

  if (organization?.isExceeded) {
    throw new HttpError('Organization has exceeded its limits', {
      status: 403,
    });
  }

  if (organization?.isCanceled) {
    throw new HttpError('Organization has been canceled', {
      status: 403,
    });
  }

  const systemPrompt = getChatSystemPrompt({
    projectId,
  });

  try {
    const result = streamText({
      model: getChatModel(),
      messages: messages.slice(-4),
      maxSteps: 2,
      tools: {
        getAllEventNames: getAllEventNames({
          projectId,
        }),
        getReport: getReport({
          projectId,
        }),
        getConversionReport: getConversionReport({
          projectId,
        }),
        getFunnelReport: getFunnelReport({
          projectId,
        }),
        getProfiles: getProfiles({
          projectId,
        }),
        getProfile: getProfile({
          projectId,
        }),
      },
      toolCallStreaming: false,
      system: systemPrompt,
      onFinish: async ({ response, usage }) => {
        request.log.info('chat usage', { usage });
        const messagesToSave = appendResponseMessages({
          messages,
          responseMessages: response.messages,
        });

        await db.chat.deleteMany({
          where: {
            projectId,
          },
        });

        await db.chat.create({
          data: {
            messages: messagesToSave.slice(-10),
            projectId,
          },
        });
      },
      onError: async (error) => {
        request.log.error('chat error', { error });
      },
    });

    reply.header('X-Vercel-AI-Data-Stream', 'v1');
    reply.header('Content-Type', 'text/plain; charset=utf-8');

    return reply.send(result.toDataStream());
  } catch (error) {
    throw new HttpError('Error during stream processing', {
      error,
    });
  }
}
