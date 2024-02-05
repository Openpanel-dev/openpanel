import cors from '@fastify/cors';
import Fastify from 'fastify';
import pino from 'pino';

import eventRouter from './routes/event.router';
import { validateSdkRequest } from './utils/auth';

declare module 'fastify' {
  interface FastifyRequest {
    projectId: string;
  }
}

const port = parseInt(process.env.API_PORT || '3000', 10);

const startServer = async () => {
  try {
    const fastify = Fastify({
      logger: pino({ level: 'info' }),
    });

    fastify.register(cors, {
      origin: '*',
    });

    fastify.decorateRequest('projectId', '');

    fastify.addHook('preHandler', (req, reply, done) => {
      validateSdkRequest(req.headers)
        .then((projectId) => {
          req.projectId = projectId;
          done();
        })
        .catch((e) => {
          console.log(e);

          reply.status(401).send();
        });
    });

    fastify.register(eventRouter, { prefix: '/event' });
    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);
    });
    fastify.get('/', (request, reply) => {
      reply.send({ name: 'openpanel sdk api' });
    });
    // fastify.get('/health-check', async (request, reply) => {
    //   try {
    //     await utils.healthCheck()
    //     reply.status(200).send()
    //   } catch (e) {
    //     reply.status(500).send()
    //   }
    // })
    if (process.env.NODE_ENV === 'production') {
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () =>
          fastify.close().then((err) => {
            console.log(`close application on ${signal}`);
            process.exit(err ? 1 : 0);
          })
        );
      }
    }

    await fastify.listen({ host: '0.0.0.0', port });
  } catch (e) {
    console.error(e);
  }
};

process.on('unhandledRejection', (e) => {
  console.error(e);
  process.exit(1);
});

startServer();
