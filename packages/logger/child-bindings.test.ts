import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from './index';

/**
 * Capture what actually reaches the transport. Redaction that only holds for
 * direct log calls is not redaction — a secret bound to a child logger is
 * repeated on every line that logger emits, which is the higher-volume leak.
 */
function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  return { lines, restore: () => (process.stdout.write = original) };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Force the plain stdout JSON path: no pino-pretty worker, no OTLP.
  process.env.NODE_ENV = 'production';
  process.env.LOG_EXPORTER = 'stdout';
  process.env.LOG_SILENT = 'false';
  process.env.HYPERDX_API_KEY = undefined;
  Reflect.deleteProperty(process.env, 'HYPERDX_API_KEY');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('child logger bindings', () => {
  it('redacts secrets bound via child(), not just those logged directly', () => {
    const { lines, restore } = captureStdout();
    try {
      const logger = createLogger({ name: 'test' });
      const child = logger.child({
        importId: 'import-1',
        config: { provider: 'mixpanel', serviceSecret: 'SHOULD_NOT_APPEAR' },
      });

      child.info('first line');
      child.info('second line');
    } finally {
      restore();
    }

    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line).not.toContain('SHOULD_NOT_APPEAR');
      expect(line).toContain('[REDACTED]');
    }
  });

  it('keeps non-sensitive bindings intact', () => {
    const { lines, restore } = captureStdout();
    try {
      createLogger({ name: 'test' })
        .child({ importId: 'import-1', config: { provider: 'mixpanel' } })
        .info('line');
    } finally {
      restore();
    }

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.importId).toBe('import-1');
    expect(parsed.config.provider).toBe('mixpanel');
  });

  it('redacts a secret nested past the traversal depth limit', () => {
    const { lines, restore } = captureStdout();
    try {
      const logger = createLogger({ name: 'test' });
      const child = logger.child({
        a: { b: { c: { d: { e: { serviceSecret: 'SHOULD_NOT_APPEAR' } } } } },
      });

      child.info('line');
    } finally {
      restore();
    }

    expect(lines[0]).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('redacts bindings on a grandchild logger too', () => {
    const { lines, restore } = captureStdout();
    try {
      createLogger({ name: 'test' })
        .child({ importId: 'import-1' })
        .child({ serviceSecret: 'SHOULD_NOT_APPEAR' })
        .info('line');
    } finally {
      restore();
    }

    expect(lines[0]).not.toContain('SHOULD_NOT_APPEAR');
    expect(lines[0]).toContain('[REDACTED]');
  });
});
