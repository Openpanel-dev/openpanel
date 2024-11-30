import { isBot } from '@/bots';
import { handler } from '@/controllers/track.controller';
import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { clientHook } from '@/hooks/client.hook';
import { isBotHook } from '@/hooks/is-bot.hook';
import { createBotEvent } from '@openpanel/db';
import type { TrackHandlerPayload } from '@openpanel/sdk';

const trackRouter: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.addHook('preHandler', clientHook);
  fastify.addHook('preHandler', isBotHook);

  fastify.route({
    method: 'POST',
    url: '/',
    handler: handler,
  });

  done();
};

export default trackRouter;
