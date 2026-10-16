// The response body is the `{status, error, message}` shape API consumers
// parse. Elysia's own `VALIDATION` failures map onto it at 400: a bad `/track`
// body must keep seeing 400, not Elysia's 422.
//
// There is deliberately no not-found handler: an unmatched route keeps the
// framework's answer.

import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { HttpError, normalizeError } from '../shared/errors';
import { requestContext } from './context';

const RATE_LIMITED_STATUS = 429;
const SERVER_ERROR_STATUS = 500;

const SKIP_LOG_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'FST_ERR_CTP_INVALID_MEDIA_TYPE',
  // A 404 is the caller's business, not an incident.
  'NOT_FOUND',
];

const VALIDATION_STATUS = 400;
/** The `error` name in the response body is the literal string `'Error'`: a stable API contract. */
const VALIDATION_ERROR_NAME = 'Error';

/** Elysia's name for the validated request part, mapped to the word the response body has always carried (callers parse it). */
const VALIDATION_SLOT_NAMES: Record<string, string> = {
  query: 'querystring',
  body: 'body',
  params: 'params',
  headers: 'headers',
  cookie: 'cookie',
  response: 'response',
};

export interface ErrorHandlerOptions {
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
        // 4xx are client-side problems; warn so they don't drown real errors.
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
        // HttpError carries an explicit `error` payload; otherwise surface the
        // error name so the body is always a stable JSON shape.
        error: errorField(error, isValidation, normalized.errorName),
        message,
      };
    });
}

/**
 * Produces the `"<slot>/<path> <zod message>"` format that is part of the
 * response body on `/export` and `/insights`. Elysia's own message is a
 * multi-line JSON dump, so this reads the structured error fields instead.
 */
function validationMessage(error: unknown): string {
  // With a zod (Standard Schema) validator the instance carries `type` (the
  // request part) and `all` (one entry per issue, slash-joined `path`).
  // `message` is the whole pretty-printed report: the fallback.
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
