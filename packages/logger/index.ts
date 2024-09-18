import * as HyperDX from '@hyperdx/node-opentelemetry';
import winston from 'winston';

export { winston };

export type ILogger = winston.Logger & {
  noop: (message: string) => (error: unknown) => void;
};

const logLevel = process.env.LOG_LEVEL ?? 'info';

export function createLogger({ name }: { name: string }): ILogger {
  const service = `${name}-${process.env.NODE_ENV ?? 'dev'}`;

  const prettyError = (error: Error) => ({
    ...error,
    stack: error.stack,
    message: error.message,
  });

  const errorFormatter = winston.format((info) => {
    if (info.error instanceof Error) {
      return {
        ...info,
        error: prettyError(info.error),
      };
    }
    if (info instanceof Error) {
      return {
        ...info,
        ...prettyError(info),
      };
    }
    return info;
  });

  const format = winston.format.combine(
    errorFormatter(),
    winston.format.json(),
  );

  const transports: winston.transport[] = [new winston.transports.Console()];
  if (process.env.HYPERDX_API_KEY) {
    transports.push(
      HyperDX.getWinstonTransport(logLevel, {
        detectResources: true,
        service,
      }),
    );
  }

  const logger = winston.createLogger({
    defaultMeta: { service },
    level: logLevel,
    format,
    transports,
    // Add ISO levels of logging from PINO
    levels: Object.assign(
      { fatal: 0, warn: 4, trace: 7 },
      winston.config.syslog.levels,
    ),
  });

  return Object.assign(logger, {
    noop: (message: string) => (error: unknown) =>
      logger.error(`noop: ${message}`, error),
  });
}
