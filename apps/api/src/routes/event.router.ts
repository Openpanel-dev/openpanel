import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import * as controller from '@/controllers/event.controller';
import { clientHook } from '@/hooks/client.hook';
import { duplicateHook } from '@/hooks/duplicate.hook';
import { isBotHook } from '@/hooks/is-bot.hook';
import { legacyEventUsageHook } from '@/hooks/legacy-event.hook';
import { subscriptionHook } from '@/hooks/subscription.hook';

const eventRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preValidation', duplicateHook);
  fastify.addHook('preHandler', clientHook);
  // Usage metric before the hooks that can short-circuit — see the hook.
  fastify.addHook('preHandler', legacyEventUsageHook);
  fastify.addHook('preHandler', isBotHook);
  fastify.addHook('preHandler', subscriptionHook);

  fastify.route({
    method: 'POST',
    url: '/',
    schema: {
      tags: ['Event'],
      description:
        'Deprecated direct event ingestion endpoint. Use /track instead.',
    },
    handler: controller.postEvent,
  });
};

export default eventRouter;
