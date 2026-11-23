import { expect, test } from 'bun:test';

test('writes application and intercepted logs once to stdout under Bun', () => {
  const source = `
    const { testCoreConfig } = await import('../test/config-fixture.ts');
    const { createLogger, interceptProcessOutput } = await import('./pino-logger.ts');
    Date.now = () => Date.parse('2026-01-15T12:34:56.123Z');
    const config = testCoreConfig({ isProduction: true });
    config.logging.exporter = 'stdout';
    config.logging.interceptProcessOutput = true;
    config.logging.timezone = 'Asia/Riyadh';
    const logger = createLogger({ name: 'stdout-regression', config });
    interceptProcessOutput(config, logger);
    logger.info({ token: 'synthetic-token' }, 'application log');
    process.stdout.write('intercepted stdout\\n');
    process.stderr.write('intercepted stderr\\n');
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

  expect(child.exitCode).toBe(0);
  expect(child.stderr.toString()).toBe('');
  const logs = child.stdout
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(logs).toHaveLength(3);
  expect(logs[0]).toMatchObject({
    level: 30,
    msg: 'application log',
    token: '[REDACTED]',
    time: '2026-01-15 15:34:56.123+03:00',
  });
  expect(logs[1]).toMatchObject({
    level: 30,
    msg: 'intercepted stdout',
    source: 'stdout',
  });
  expect(logs[2]).toMatchObject({
    level: 50,
    msg: 'intercepted stderr',
    source: 'stderr',
  });
});
