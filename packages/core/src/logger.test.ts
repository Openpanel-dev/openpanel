import { describe, expect, test } from 'bun:test';
import { type Logger, REQUEST_ID_HEADER, REQUEST_ID_LOG_FIELD } from './logger';

function createFakeLogger(bindings: Record<string, unknown> = {}): Logger {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: the fake only needs a shape, not behavior
  const noop: Logger['info'] = () => {};
  return {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: (childBindings) =>
      createFakeLogger({ ...bindings, ...childBindings }),
  };
}

describe('Logger structural interface', () => {
  test('a plain object satisfies it with no pino import', () => {
    const logger = createFakeLogger();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  test('child() returns another Logger', () => {
    const logger = createFakeLogger();
    const child = logger.child({ requestId: 'abc123' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.child).toBe('function');
  });
});

describe('requestId constants', () => {
  test('the log field is requestId, not reqId', () => {
    expect(REQUEST_ID_LOG_FIELD).toBe('requestId');
  });

  test('the wire header stays request-id byte-for-byte', () => {
    expect(REQUEST_ID_HEADER).toBe('request-id');
  });
});
