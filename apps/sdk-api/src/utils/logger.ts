import pino from 'pino';

const ENABLED = process.env.NODE_ENV === 'production';

const transport = pino.transport({
  targets: ENABLED
    ? [
        {
          target: '@logtail/pino',
          options: { sourceToken: process.env.BETTERSTACK_TOKEN },
        },
        {
          target: 'pino-pretty',
        },
      ]
    : [],
});

export const logger = pino(transport);

export function logInfo(msg: string, obj?: unknown) {
  logger.info(obj, msg);
}

export const noop = (message: string) => (error: unknown) =>
  logger.error(error, message);
