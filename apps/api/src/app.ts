/** biome-ignore-all lint/suspicious/useAwait: fastify need async or done callbacks */
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import cors, { type FastifyCorsOptions } from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import {
  EMPTY_SESSION,
  type SessionValidationResult,
  decodeSessionToken,
  validateSessionToken,
} from '@openpanel/auth';
import { generateId } from '@openpanel/common';
import { type IServiceClientWithProject, runWithAlsSession } from '@openpanel/db';
import type { AppRouter } from '@openpanel/trpc';
import { appRouter, createContext } from '@openpanel/trpc';
import type { FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import metricsPlugin from 'fastify-metrics';
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransformers,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-zod-openapi';
import {
  healthcheck,
  liveness,
  readiness,
} from './controllers/healthcheck.controller';
import { ipHook } from './hooks/ip.hook';
import { requestIdHook } from './hooks/request-id.hook';
import { requestLoggingHook } from './hooks/request-logging.hook';
import { timestampHook } from './hooks/timestamp.hook';
import aiRouter from './routes/ai.router';
import eventRouter from './routes/event.router';
import exportRouter from './routes/export.router';
import gscCallbackRouter from './routes/gsc-callback.router';
import importRouter from './routes/import.router';
import insightsRouter from './routes/insights.router';
import liveRouter from './routes/live.router';
import manageRouter from './routes/manage.router';
import mcpRouter from './routes/mcp.router';
import miscRouter from './routes/misc.router';
import oauthRouter from './routes/oauth-callback.router';
import profileRouter from './routes/profile.router';
import trackRouter from './routes/track.router';
import webhookRouter from './routes/webhook.router';
import { HttpError } from './utils/errors';
import { logger } from './utils/logger';

declare module 'fastify' {
  interface FastifyRequest {
    client: IServiceClientWithProject | null;
    clientIp: string;
    clientIpHeader: string;
    timestamp?: number;
    session: SessionValidationResult;
  }
}

export interface BuildAppOptions {
  /** Set to true when running under Vitest — disables logging and Prometheus metrics */
  testing?: boolean;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const { testing = false } = options;

  const fastify = Fastify({
    maxParamLength: 15_000,
    bodyLimit: 1_048_576 * 500,
    disableRequestLogging: true,
    genReqId: (req) =>
      req.headers['request-id']
        ? String(req.headers['request-id'])
        : generateId(),
    ...(testing
      ? { logger: false }
      : { loggerInstance: logger as unknown as FastifyBaseLogger }),
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  fastify.register(cors, () => {
    return (
      req: FastifyRequest,
      callback: (error: Error | null, options: FastifyCorsOptions) => void,
    ) => {
      const corsPaths = ['/trpc', '/live', '/webhook', '/oauth', '/misc', '/ai', '/mcp'];
      const isPrivatePath = corsPaths.some((p) => req.url.startsWith(p));

      if (isPrivatePath) {
        const allowedOrigins = [
          process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL,
          ...(process.env.API_CORS_ORIGINS?.split(',') ?? []),
        ].filter(Boolean);
        const origin = req.headers.origin;
        const isAllowed = origin && allowedOrigins.includes(origin);
        return callback(null, { origin: isAllowed ? origin : false, credentials: true });
      }

      return callback(null, { origin: '*', maxAge: 86_400 * 7 });
    };
  });

  await fastify.register(import('fastify-raw-body'), { global: false });

  fastify.addHook('onRequest', requestIdHook);
  fastify.addHook('onRequest', timestampHook);
  fastify.addHook('onRequest', ipHook);
  fastify.addHook('onResponse', requestLoggingHook);

  fastify.register(compress, { global: false, encodings: ['gzip', 'deflate'] });

  // Dashboard API
  fastify.register(async (instance) => {
    instance.register(cookie, {
      secret: process.env.COOKIE_SECRET ?? '',
      hook: 'onRequest',
      parseOptions: {},
    });

    instance.addHook('onRequest', async (req) => {
      if (req.cookies?.session) {
        try {
          const sessionId = decodeSessionToken(req.cookies?.session);
          const session = await runWithAlsSession(sessionId, () =>
            validateSessionToken(req.cookies.session),
          );
          req.session = session;
        } catch {
          req.session = EMPTY_SESSION;
        }
      } else if (process.env.DEMO_USER_ID) {
        try {
          const session = await runWithAlsSession('1', () =>
            validateSessionToken(null),
          );
          req.session = session;
        } catch {
          req.session = EMPTY_SESSION;
        }
      } else {
        req.session = EMPTY_SESSION;
      }
    });

    instance.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router: appRouter,
        createContext,
        onError(ctx) {
          if (ctx.error.code === 'UNAUTHORIZED' && ctx.path === 'organization.list') {
            return;
          }
          ctx.req.log.error('trpc error', {
            error: ctx.error,
            path: ctx.path,
            input: ctx.input,
            type: ctx.type,
            session: ctx.ctx?.session,
          });
        },
      } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
    });

    instance.register(liveRouter, { prefix: '/live' });
    instance.register(webhookRouter, { prefix: '/webhook' });
    instance.register(oauthRouter, { prefix: '/oauth' });
    instance.register(gscCallbackRouter, { prefix: '/gsc' });
    instance.register(miscRouter, { prefix: '/misc' });
    instance.register(aiRouter, { prefix: '/ai' });
    instance.register(mcpRouter, { prefix: '/mcp' });
  });

  // Public API
  fastify.register(async (instance) => {
    await instance.register(fastifyZodOpenApiPlugin);
    await instance.register(fastifySwagger, {
      openapi: {
        info: { title: 'OpenPanel API', version: '1.0.0' },
        openapi: '3.1.0',
      },
      ...fastifyZodOpenApiTransformers,
    });
    await instance.register(fastifySwaggerUI, { routePrefix: '/documentation' });

    // Prometheus metrics: skip in tests (causes global state conflicts across test runs)
    if (!testing) {
      instance.register(metricsPlugin, { endpoint: '/metrics' });
    }

    instance.register(eventRouter, { prefix: '/event' });
    instance.register(profileRouter, { prefix: '/profile' });
    instance.register(exportRouter, { prefix: '/export' });
    instance.register(importRouter, { prefix: '/import' });
    instance.register(insightsRouter, { prefix: '/insights' });
    instance.register(trackRouter, { prefix: '/track' });
    instance.register(manageRouter, { prefix: '/manage' });

    instance.get('/healthcheck', healthcheck);
    instance.get('/healthz/live', liveness);
    instance.get('/healthz/ready', readiness);
    instance.get('/', (_request, reply) =>
      reply.send({ status: 'ok', message: 'Successfully running OpenPanel.dev API' }),
    );
  });

  const SKIP_LOG_ERRORS = ['UNAUTHORIZED', 'FST_ERR_CTP_INVALID_MEDIA_TYPE'];
  fastify.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 429) {
      return reply.status(429).send({
        status: 429,
        error: 'Too Many Requests',
        message: 'You have exceeded the rate limit for this endpoint.',
      });
    }

    if (error instanceof HttpError) {
      if (!SKIP_LOG_ERRORS.includes(error.code)) {
        request.log.error('internal server error', { error });
      }
      if (process.env.NODE_ENV === 'production' && error.status === 500) {
        return reply.status(500).send('Internal server error');
      }
      return reply.status(error.status).send({
        status: error.status,
        error: error.error,
        message: error.message,
      });
    }

    if (!SKIP_LOG_ERRORS.includes(error.code)) {
      request.log.error('request error', { error });
    }

    const status = error?.statusCode ?? 500;
    if (process.env.NODE_ENV === 'production' && status === 500) {
      return reply.status(500).send('Internal server error');
    }

    return reply.status(status).send({ status, error, message: error.message });
  });

  return fastify;
}
