import { createLogger } from '@openpanel/logger';

export const logger = createLogger({ target: 'api' });

export function logInfo(msg: string, obj?: unknown) {
  logger.info(obj, msg);
}

export const noop = (message: string) => (error: unknown) =>
  logger.error(error, message);
