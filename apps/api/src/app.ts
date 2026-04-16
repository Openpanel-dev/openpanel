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
import { toFastifyHandler } from '@better-agent/adapters';
import { chatApp } from './agents/app';
import { chatRunContext } from './agents/run-context';
import {
  db,
  getConversationById,
  getOrganizationByProjectIdCached,
  getProjectAccess,
  getSettingsForProject,
} from '@openpanel/db';
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

  // Env is read once at startup — changing CORS origins requires a
  // restart, which is already true for every other env-driven piece
  // of the server.
  const dashboardOrigins = [
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL,
    ...(process.env.API_CORS_ORIGINS?.split(',') ?? []),
  ].filter(Boolean) as string[];
  const corsPaths = ['/trpc', '/live', '/webhook', '/oauth', '/misc', '/ai'];

  fastify.register(cors, () => {
    return (
      req: FastifyRequest,
      callback: (error: Error | null, options: FastifyCorsOptions) => void,
    ) => {
      const isPrivatePath = corsPaths.some((p) => req.url.startsWith(p));

      if (isPrivatePath) {
        const origin = req.headers.origin;
        const isAllowed = origin && dashboardOrigins.includes(origin);
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
    // Better Agent chat, mounted under /ai/agents/*.
    //
    // The wrapper does three things before delegating to the Better
    // Agent handler:
    //   1. Sets CORS headers on `reply.raw` (survives `reply.hijack()`
    //      which bypasses @fastify/cors's onSend hook)
    //   2. Validates the session + project access (the user-visible
    //      POST /run body carries `context.projectId` +
    //      `context.organizationId`)
    //   3. Wraps the handler call in `chatRunContext.run(...)` so the
    //      Prisma conversation-store can upsert the `Conversation`
    //      row with the right owner on first save
    //
    // Preflight OPTIONS is handled by @fastify/cors before this route
    // runs, so we only skip auth/ALS for that case.
    {
      const agentHandler = toFastifyHandler(chatApp);

      instance.all('/ai/agents/*', async (request, reply) => {
        const origin = request.headers.origin;
        if (origin && dashboardOrigins.includes(origin)) {
          reply.raw.setHeader('Access-Control-Allow-Origin', origin);
          reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
          reply.raw.setHeader('Vary', 'Origin');
        }

        // OPTIONS preflight is already handled by @fastify/cors.
        if (request.method === 'OPTIONS') {
          return agentHandler(request, reply);
        }

        const userId = request.session?.session?.userId;
        if (!userId) {
          return reply.status(401).send({ message: 'Sign in required' });
        }

        // Parse the URL tail that comes after `/ai/agents/`.
        // Examples:
        //   "claude-sonnet-4-5/run"                      → run
        //   "claude-sonnet-4-5/conversations/abc"        → load conversation
        //   "__titler/run"                               → title stream (no project context)
        const wildcard =
          (request.params as { '*'?: string })['*'] ?? '';
        const segments = wildcard.split('/').filter(Boolean);
        const agentName = segments[0] ?? '';
        const route = segments[1] ?? '';
        const routeId = segments[2] ?? '';

        // The internal `__titler` agent has no project context — skip
        // the access check; session auth is enough.
        if (agentName === '__titler') {
          return agentHandler(request, reply);
        }

        // Conversation hydration: `GET /:name/conversations/:id` and
        // `GET /:name/conversations/:id/resume`. If the row exists,
        // verify ownership. If it doesn't exist yet (brand-new chat
        // the client is opening for the first time), let the agent
        // handler respond — its ConversationStore.load() returns null
        // and the adapter maps that to a 204, which Better Agent's
        // client treats as "no saved history". Returning 404 here
        // would instead put `useAgent` in an error state and block
        // the first send.
        if (route === 'conversations' && routeId) {
          const conv = await getConversationById(routeId);
          if (conv && conv.userId !== userId) {
            return reply
              .status(404)
              .send({ message: 'Conversation not found' });
          }
          return agentHandler(request, reply);
        }

        // Everything else (primarily `POST /:name/run`) is an active
        // run and must carry `context.projectId` + `context.organizationId`.
        const body = request.body as
          | { context?: { projectId?: string; organizationId?: string } }
          | null
          | undefined;
        const projectId = body?.context?.projectId;
        const organizationIdFromBody = body?.context?.organizationId;

        if (!projectId || !organizationIdFromBody) {
          return reply.status(400).send({
            message: 'Missing projectId or organizationId in context',
          });
        }

        const [access, organization, settings] = await Promise.all([
          getProjectAccess({ projectId, userId }),
          getOrganizationByProjectIdCached(projectId),
          // Fetch the project's timezone up front so the tools +
          // prompt builder can resolve range presets ("6m", "7d", …)
          // into concrete dates without an async lookup per call.
          // Falls back to UTC on any error — preset resolution then
          // still works, just in UTC instead of the user's zone.
          getSettingsForProject(projectId).catch(() => ({ timezone: 'UTC' })),
        ]);
        if (
          !access ||
          !organization ||
          organization.id !== organizationIdFromBody
        ) {
          return reply
            .status(403)
            .send({ message: 'No access to this project' });
        }

        // The conversation row is created lazily: the agent's
        // `ConversationStore.save()` upserts on first save, and the
        // TRPC `conversation.rename` endpoint upserts when the titler
        // finishes first. Either path ends up with the correct owner
        // — no eager upsert needed here.

        return chatRunContext.run(
          {
            userId,
            projectId,
            organizationId: organization.id,
            timezone: settings.timezone || 'UTC',
          },
          () => agentHandler(request, reply),
        );
      });
    }
    instance.register(mcpRouter, { prefix: '/mcp' });
  });

  // Public API
  fastify.register(async (instance) => {
    await instance.register(fastifyZodOpenApiPlugin);
    await instance.register(fastifySwagger, {
      openapi: {
        info: { title: 'OpenPanel API', version: '1.0.0' },
        openapi: '3.1.0',
        tags: [
          { name: 'Track', description: 'Track events and sessions' },
          { name: 'Profile', description: 'Identify and update user profiles' },
          { name: 'Export', description: 'Export data' },
          { name: 'Import', description: 'Import historical data' },
          { name: 'Insights', description: 'Query analytics data' },
          { name: 'Manage', description: 'Manage projects and clients' },
          { name: 'Event', description: 'Legacy event ingestion (deprecated, use /track)' },
        ],
      },
      ...fastifyZodOpenApiTransformers,
      transform(args) {
        if (args.url === '/metrics') {
          return { schema: { ...args.schema, hide: true }, url: args.url };
        }
        return fastifyZodOpenApiTransformers.transform(args);
      },
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

    instance.get('/healthcheck', { schema: { hide: true } }, healthcheck);
    instance.get('/healthz/live', { schema: { hide: true } }, liveness);
    instance.get('/healthz/ready', { schema: { hide: true } }, readiness);
    instance.get('/', { schema: { hide: true } }, (_request, reply) =>
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
        // 4xx are client-side problems (bad payloads, missing fields, etc.) —
        // log as warn so they don't drown out real server errors.
        const log = error.status >= 500 ? request.log.error : request.log.warn;
        log.call(request.log, 'internal server error', { error });
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

    const status = error?.statusCode ?? 500;

    if (!SKIP_LOG_ERRORS.includes(error.code)) {
      // Same rationale: client errors (incl. FST_ERR_VALIDATION) are warnings,
      // not errors. They are caused by callers, not by us.
      const log = status >= 500 ? request.log.error : request.log.warn;
      log.call(request.log, 'request error', { error });
    }

    if (process.env.NODE_ENV === 'production' && status === 500) {
      return reply.status(500).send('Internal server error');
    }

    return reply.status(status).send({ status, error, message: error.message });
  });

  return fastify;
}
