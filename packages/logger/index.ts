import * as HyperDX from '@hyperdx/node-opentelemetry';
import winston from 'winston';

export { winston };

export type ILogger = winston.Logger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';

const customLevels = {
  fatal: 0,
  warn: 4,
  trace: 7,
};

// naming all darn levels to make sure we never get any errors with the logger
winston.addColors({
  emerg: 'red',
  alert: 'red',
  crit: 'red',
  error: 'red',
  warning: 'yellow',
  notice: 'cyan',
  info: 'green',
  debug: 'blue',
  fatal: 'red',
  warn: 'yellow',
  trace: 'gray',
});

export function createLogger({ name }: { name: string }): ILogger {
  const service = [process.env.LOG_PREFIX, name, process.env.NODE_ENV ?? 'dev']
    .filter(Boolean)
    .join('-');

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

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'authorization',
    'apiKey',
  ];

  const redactSensitiveInfo = winston.format((info) => {
    const redactObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;

      return Object.keys(obj).reduce((acc, key) => {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some((k) => lowerKey.includes(k))) {
          acc[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          if (obj[key] instanceof Date) {
            acc[key] = obj[key].toISOString();
          } else {
            acc[key] = redactObject(obj[key]);
          }
        } else {
          acc[key] = obj[key];
        }
        return acc;
      }, {} as any);
    };

    return Object.assign({}, info, redactObject(info));
  });

  const transports: winston.transport[] = [];
  let format: winston.Logform.Format;

  if (process.env.HYPERDX_API_KEY) {
    transports.push(
      HyperDX.getWinstonTransport(logLevel, {
        detectResources: true,
        service,
      }),
    );
    format = winston.format.combine(
      errorFormatter(),
      redactSensitiveInfo(),
      winston.format.json(),
    );
  } else {
    transports.push(new winston.transports.Console());
    format = winston.format.combine(
      errorFormatter(),
      redactSensitiveInfo(),
      winston.format.colorize({
        all: true,
      }),
      winston.format.printf((info) => {
        const { level, message, service, ...meta } = info;
        const metaStr =
          Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${level} ${message}${metaStr}`;
      }),
    );
  }

  const logger = winston.createLogger({
    defaultMeta: { service },
    level: logLevel,
    format,
    transports,
    silent,
    levels: Object.assign({}, customLevels, winston.config.syslog.levels),
  });

  return logger;
}
