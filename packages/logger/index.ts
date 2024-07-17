import type { TransportTargetOptions } from 'pino';
import pino from 'pino';

export function createLogger({ dataset }: { dataset: string }) {
  const targets: TransportTargetOptions[] =
    process.env.NODE_ENV === 'production' && process.env.BASELIME_API_KEY
      ? [
          {
            target: '@baselime/pino-transport',
            options: { baselimeApiKey: process.env.BASELIME_API_KEY, dataset },
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

  return pino(transport);
}
