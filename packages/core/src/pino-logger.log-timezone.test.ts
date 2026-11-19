import { describe, expect, it } from 'bun:test';

function logOutput(
  timezone: string,
  silent = false
): Record<string, unknown>[] {
  const source = `
    const { testCoreConfig } = await import(${JSON.stringify(new URL('../test/config-fixture.ts', import.meta.url).href)});
    const { createLogger } = await import(${JSON.stringify(new URL('./pino-logger.ts', import.meta.url).href)});
    Date.now = () => Date.parse('2026-01-15T12:34:56.123Z');
    const config = testCoreConfig({ isProduction: true });
    config.logging.timezone = ${JSON.stringify(timezone)};
    config.logging.silent = ${JSON.stringify(silent)};
    const logger = createLogger({ name: 'f06', config });
    logger.info({ token: 'synthetic-token', __wasl_op_trace_id: 'f06-trace',
      reqId: 'ordinary-id', nested: { reqId: 'nested-id' } }, 'f06-parent');
    logger.child({ scope: 'child' }).info('f06-child');
    logger.debug('f06-hidden');
  `;
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--no-install', '--eval', source],
    {
      cwd: import.meta.dir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: 'production',
        TZ: 'UTC',
      },
      timeout: 10_000,
    }
  );
  if (child.exitCode !== 0) {
    throw new Error(`Isolated logger process failed (${child.exitCode})`);
  }
  return child.stdout
    .toString()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('core logger display timezone', () => {
  it('formats parent and child logs while preserving level, redaction and IDs', () => {
    const logs = logOutput('Asia/Riyadh');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      time: '2026-01-15 15:34:56.123+03:00',
      level: 30,
      token: '[REDACTED]',
      __wasl_op_trace_id: 'f06-trace',
      reqId: 'ordinary-id',
      nested: { reqId: 'nested-id' },
    });
    expect(logs[1]).toMatchObject({
      time: '2026-01-15 15:34:56.123+03:00',
      scope: 'child',
    });
  });

  it('falls back to UTC for an invalid injected display timezone', () => {
    expect(logOutput('Invalid/Timezone')[0]?.time).toBe(
      '2026-01-15 12:34:56.123+00:00'
    );
  });

  it('keeps a silent logger silent', () => {
    expect(logOutput('Asia/Riyadh', true)).toEqual([]);
  });

  it('disables time translation in the actual Node development transport', () => {
    const source = `
      const { mock } = await import('bun:test');
      const realPino = await import('pino');
      const createPino = realPino.default;
      const { prettyFactory } = await import('pino-pretty');
      let captured;
      mock.module('pino', () => ({ ...realPino, default: (options) => {
        captured = options;
        return createPino({ ...options, transport: undefined });
      }}));
      const originalProcess = process;
      globalThis.process = new Proxy(originalProcess, { get(target, key) {
        return key === 'versions' ? { ...target.versions, bun: undefined } : Reflect.get(target, key);
      }});
      const { testCoreConfig } = await import(${JSON.stringify(new URL('../test/config-fixture.ts', import.meta.url).href)});
      const { createLogger } = await import(${JSON.stringify(new URL('./pino-logger.ts', import.meta.url).href)});
      createLogger({ name: 'f06-pretty', config: testCoreConfig() });
      const time = '2026-01-15 15:34:56.123+03:00';
      console.log(JSON.stringify({
        target: captured.transport.target,
        translateTime: captured.transport.options.translateTime,
        preview: prettyFactory(captured.transport.options)({ level: 30, time, msg: 'f06-pretty' }),
      }));
    `;
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--no-install', '--eval', source],
      {
        cwd: import.meta.dir,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          NODE_ENV: 'development',
          TZ: 'UTC',
        },
        timeout: 10_000,
      }
    );
    expect(child.exitCode).toBe(0);
    const options = JSON.parse(child.stdout.toString());
    expect(options.target).toBe('pino-pretty');
    expect(options.translateTime).toBe(false);
    expect(options.preview).toContain('2026-01-15 15:34:56.123+03:00');
  });
});
