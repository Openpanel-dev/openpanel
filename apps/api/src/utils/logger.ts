import type { TransportTargetOptions } from 'pino';
import pino from 'pino';

const targets: TransportTargetOptions[] =
  process.env.NODE_ENV === 'production'
    ? [
        {
          target: '@baselime/pino-transport',
          options: { baselimeApiKey: process.env.BASELIME_API_KEY },
        },
      ]
    : [
        {
          target: 'pino-pretty',
        },
      ];

const transport = pino.transport({
  targets,
});

export const logger = pino(transport);

export function logInfo(msg: string, obj?: unknown) {
  logger.info(obj, msg);
}

export const noop = (message: string) => (error: unknown) =>
  logger.error(error, message);
