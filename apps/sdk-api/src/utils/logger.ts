import type { TransportTargetOptions } from 'pino';
import pino from 'pino';

const targets: TransportTargetOptions[] =
  process.env.NODE_ENV === 'production'
    ? [
        {
          target: '@logtail/pino',
          options: { sourceToken: process.env.BETTERSTACK_TOKEN },
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
