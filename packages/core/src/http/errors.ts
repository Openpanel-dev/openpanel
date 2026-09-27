// The one error handler, ported from apps/api/src/app.ts:408-460 (ADR-002
// "behaviour that must be preserved explicitly" 6: "the error handler's shape,
// including the absence of a not-found handler").
//
// The body is V1's `{status, error, message}` — ADR-003 lists that shape under
// "behaviour that must be re-implemented deliberately", because V1 produced it
// as a side effect of the Fastify error handler and nothing reproduces it on
// its own. Elysia's own `VALIDATION` failures are mapped onto it too, at 400:
// that is the status V1's zod compilers threw with, and a caller that sends a
// bad `/track` body must keep seeing 400 rather than Elysia's 422.
//
// There is deliberately NO not-found handler: V1 had none, so an unmatched
// route keeps whatever the framework answers.

import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { HttpError, normalizeError } from '../shared/errors';
import { requestContext } from './context';

const RATE_LIMITED_STATUS = 429;
const SERVER_ERROR_STATUS = 500;

/** V1's SKIP_LOG_ERRORS. `FST_ERR_CTP_INVALID_MEDIA_TYPE` is Fastify's and can
 *  no longer occur; it stays so the list is recognisably the same one. */
const SKIP_LOG_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'FST_ERR_CTP_INVALID_MEDIA_TYPE',
  // Every request for a route that does not exist logged a warning with a
  // stack trace. A 404 is the caller's business, not an incident.
  'NOT_FOUND',
];

const VALIDATION_STATUS = 400;
/** V1's zod compilers threw a plain `Error`, so `normalizeError` reported
 *  `Error` as the name and the body carried `"error":"Error"`. */
const VALIDATION_ERROR_NAME = 'Error';

/**
 * Fastify names the request part it validated; Elysia names the same thing in
 * its own vocabulary. The response body carries Fastify's word, because that
 * string is what callers have been parsing.
 */
const VALIDATION_SLOT_NAMES: Record<string, string> = {
  query: 'querystring',
  body: 'body',
  params: 'params',
  headers: 'headers',
  cookie: 'cookie',
  response: 'response',
};

export interface ErrorHandlerOptions {
  /** `NODE_ENV === 'production'` at the call site — core reads no environment. */
  production: boolean;
}

export function errorHandler(deps: AppDeps, options: ErrorHandlerOptions) {
  return new Elysia({ name: 'core/http/error-handler' })
    .use(requestContext(deps))
    .onError({ as: 'global' }, ({ code, error, set, request, path, ctx }) => {
      const isValidation = code === 'VALIDATION';
      const normalized = normalizeError(error);
      const status = isValidation ? VALIDATION_STATUS : normalized.status;
      const message = isValidation
        ? validationMessage(error)
        : normalized.message;
      const logger = ctx?.logger ?? deps.logger;

      if (status === RATE_LIMITED_STATUS) {
        set.status = RATE_LIMITED_STATUS;
        return {
          status: RATE_LIMITED_STATUS,
          error: 'Too Many Requests',
          message: 'You have exceeded the rate limit for this endpoint.',
        };
      }

      const skipLog =
        status < SERVER_ERROR_STATUS &&
        normalized.code !== undefined &&
        SKIP_LOG_ERROR_CODES.includes(normalized.code);

      if (!skipLog) {
        // 4xx are client-side problems (bad payloads, missing fields, etc.) —
        // log as warn so they don't drown out real server errors.
        const label =
          error instanceof HttpError
            ? 'internal server error'
            : 'request error';
        const req = {
          id: ctx?.requestId,
          url: path,
          method: request.method,
          headers: Object.fromEntries(request.headers),
        };
        if (status >= SERVER_ERROR_STATUS) {
          logger.error({ err: error, req }, label);
        } else {
          logger.warn({ err: error, req }, label);
        }
      }

      set.status = status;

      if (options.production && status === SERVER_ERROR_STATUS) {
        return 'Internal server error';
      }

      return {
        status,
        // HttpError carries an explicit `error` payload (the underlying
        // cause); for everything else we surface the error name so the body is
        // always a stable JSON shape, regardless of what was thrown.
        error: errorField(error, isValidation, normalized.errorName),
        message,
      };
    });
}

/**
 * V1's validation message, `"<slot>/<path> <zod message>"` — produced by
 * `fastify-zod-openapi`'s compilers, and part of the response body on
 * `/export` and `/insights`. Elysia's own message is a multi-line JSON dump,
 * which is why this reads the structured error rather than reformatting it.
 */
function validationMessage(error: unknown): string {
  // Measured on Elysia 1.4.30 with a zod (Standard Schema) validator: the
  // instance carries `type` (the request part) and `all` (one entry per issue,
  // with a slash-joined `path` string). `message` is the whole report
  // pretty-printed, which is the fallback, not the answer.
  const detail = error as {
    type?: string;
    all?: { path?: string; message?: string }[];
    message?: string;
  };
  const issue = detail.all?.[0];
  const slot = VALIDATION_SLOT_NAMES[detail.type ?? ''] ?? detail.type ?? '';

  if (!(issue?.path && issue.message)) {
    return detail.message ?? '';
  }
  return `${slot}/${issue.path} ${issue.message}`;
}

function errorField(
  error: unknown,
  isValidation: boolean,
  errorName: string
): unknown {
  if (error instanceof HttpError) {
    return error.error;
  }
  return isValidation ? VALIDATION_ERROR_NAME : errorName;
}
