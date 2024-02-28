import pino from 'pino';

const transport = pino.transport({
  targets: [
    {
      target: '@logtail/pino',
      options: { sourceToken: process.env.BETTERSTACK_TOKEN },
    },
    {
      target: 'pino-pretty',
    },
  ],
});

export const logger = pino(transport);

export function logInfo(msg: string, obj?: unknown) {
  logger.info(obj, msg);
}
