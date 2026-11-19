import { describe, expect, it } from 'bun:test';
import { loadConfig } from './env';

describe('log display timezone configuration', () => {
  it('uses LOG_TZ or UTC independently of TZ for every role', () => {
    for (const ROLE of ['api', 'worker', 'all']) {
      expect(loadConfig({ ROLE }).core.logging.timezone).toBe('UTC');
      expect(
        loadConfig({ ROLE, TZ: 'Asia/Kathmandu' }).core.logging.timezone
      ).toBe('UTC');
      expect(
        loadConfig({ ROLE, LOG_TZ: 'Asia/Riyadh', TZ: 'America/New_York' }).core
          .logging.timezone
      ).toBe('Asia/Riyadh');
    }
  });

  it('retains blank and invalid LOG_TZ for the formatter UTC fallback', () => {
    for (const LOG_TZ of ['', '  ', 'Invalid/Timezone', ' Asia/Riyadh ']) {
      expect(
        loadConfig({ LOG_TZ, TZ: 'Asia/Riyadh' }).core.logging.timezone
      ).toBe(LOG_TZ);
    }
  });

  it('does not mix logging with the business default timezone', () => {
    const config = loadConfig({
      LOG_TZ: 'Asia/Kathmandu',
      DEFAULT_TIMEZONE: 'Asia/Riyadh',
    });
    expect(config.core.logging.timezone).toBe('Asia/Kathmandu');
    expect(config.core.defaultTimezone).toBe('Asia/Riyadh');
    expect(loadConfig({}).core.logging.timezone).toBe('UTC');
  });

  it('ignores startup TZ when the boot entry subsequently selects UTC', () => {
    const source = `
      const { loadConfig } = await import(${JSON.stringify(import.meta.url.replace('env.log-timezone.test.ts', 'env.ts'))});
      const startup = loadConfig().core.logging.timezone;
      process.env.TZ = 'UTC';
      const config = loadConfig();
      console.log('F06_CONFIG:' + JSON.stringify({
        startup,
        display: config.core.logging.timezone,
        process: process.env.TZ,
        explicit: loadConfig({ TZ: 'America/New_York' }).core.logging.timezone,
      }));
    `;
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--no-install', '--eval', source],
      {
        cwd: import.meta.dir,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TZ: 'Asia/Kathmandu',
          NODE_ENV: 'production',
          LOG_EXPORTER: 'stdout',
        },
        timeout: 10_000,
      }
    );
    expect(child.exitCode).toBe(0);
    const result = child.stdout
      .toString()
      .split('\n')
      .find((line) => line.startsWith('F06_CONFIG:'));
    expect(result).toBe(
      'F06_CONFIG:{"startup":"UTC","display":"UTC","process":"UTC","explicit":"UTC"}'
    );
  });
});
