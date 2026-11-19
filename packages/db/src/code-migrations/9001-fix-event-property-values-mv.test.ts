import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeMigrationEnv } from './helpers';

const NAME = '9001-fix-event-property-values-mv.ts';
const DIR = fileURLToPath(new URL('.', import.meta.url));
const SQL_PATH = path.join(DIR, NAME.replace('.ts', '.sql'));
const FILES = [
  NAME,
  '19-event-property-values-projections.ts',
  '3-init-ch.ts',
  'helpers.ts',
  NAME.replace('.ts', '.test.ts'),
  NAME.replace('.ts', '.sql'),
];
const ENV: CodeMigrationEnv = {
  clickhouseCluster: false,
  selfHosted: true,
  databaseUrl: undefined,
  clickhouseUrl: undefined,
};
const execute = mock(async (_sqls: string[]) => undefined);
const findMany = mock(async (): Promise<{ name: string }[]> => []);
const upsert = mock(async (_args: unknown) => ({ name: NAME }));
const layout = mock(async (_args: unknown) => ({
  json: async (): Promise<{ name: string; engine: string }[]> => [],
}));
let up: typeof import('./9001-fix-event-property-values-mv').up;
let runner: typeof import('./migrate');
let dumps: { filename: string; sql: string }[];
let rejectDump = false;
let originalArgv: string[];
let previousClusterEnv: string | undefined;
let writeSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let logSpy: ReturnType<typeof spyOn>;
const readdir = fs.readdirSync.bind(fs);

beforeAll(async () => {
  // Register before dynamic imports: no real ClickHouse/Prisma client loads.
  mock.module(
    fileURLToPath(new URL('../clickhouse/client.ts', import.meta.url)),
    () => ({
      TABLE_NAMES: { event_property_values_mv: 'event_property_values_mv' },
    })
  );
  mock.module(
    fileURLToPath(new URL('../clickhouse/migration.ts', import.meta.url)),
    () => ({
      runClickhouseMigrationCommands: execute,
      chMigrationClient: { query: layout },
    })
  );
  mock.module(
    fileURLToPath(new URL('../prisma-client.ts', import.meta.url)),
    () => ({
      db: { codeMigration: { findMany, upsert } },
    })
  );
  ({ up } = await import('./9001-fix-event-property-values-mv'));
  runner = await import('./migrate');
});

beforeEach(() => {
  originalArgv = process.argv;
  previousClusterEnv = process.env.CLICKHOUSE_CLUSTER;
  process.argv = ['bun', 'isolated-f09-contract-test'];
  delete process.env.CLICKHOUSE_CLUSTER;
  dumps = [];
  rejectDump = false;
  execute.mockReset().mockResolvedValue(undefined);
  findMany.mockReset().mockResolvedValue([]);
  upsert.mockReset().mockResolvedValue({ name: NAME });
  layout.mockReset().mockResolvedValue({ json: async () => [] });
  writeSpy = spyOn(fs, 'writeFileSync').mockImplementation((filename, data) => {
    if (String(filename) !== SQL_PATH) {
      throw new Error('Unexpected filesystem write in isolated migration test');
    }
    if (rejectDump) {
      throw new Error('Synthetic SQL dump failure');
    }
    dumps.push({ filename: String(filename), sql: String(data) });
  });
  readSpy = spyOn(fs, 'readdirSync').mockImplementation(((
    directory,
    options
  ) => {
    if (path.resolve(String(directory)) === path.resolve(DIR)) {
      return [...FILES];
    }
    return Reflect.apply(readdir, fs, [directory, options]);
  }) as typeof fs.readdirSync);
  logSpy = spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  writeSpy.mockRestore();
  readSpy.mockRestore();
  logSpy.mockRestore();
  process.argv = originalArgv;
  if (previousClusterEnv === undefined) {
    delete process.env.CLICKHOUSE_CLUSTER;
  } else {
    process.env.CLICKHOUSE_CLUSTER = previousClusterEnv;
  }
});

afterAll(() => {
  // Module mocks require the package's normal --isolate file boundary.
  mock.restore();
});

describe('9001 migration SQL and environment contract', () => {
  it('modifies the local view and preserves the repair query without rebuilding data', async () => {
    await up(ENV);
    expect(execute).toHaveBeenCalledTimes(1);
    const sqls = execute.mock.calls[0]?.[0];
    expect(sqls).toHaveLength(1);
    const sql = sqls?.[0];
    expect(sql).toStartWith(
      'ALTER TABLE event_property_values_mv\nMODIFY QUERY'
    );
    expect(sql).toContain('FROM events\n');
    expect(sql).toContain(
      'ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value'
    );
    expect(sql).toContain("WHERE property_value != ''");
    expect(sql).toContain("AND property_key != ''");
    expect(sql).toContain(
      "AND property_key NOT IN ('__duration_from', '__properties_from')"
    );
    expect(sql).toContain('max(created_at) AS created_at');
    expect(sql).toContain(
      'GROUP BY project_id, name, property_key, property_value'
    );
    expect(sql).not.toMatch(/untuple|DROP|TRUNCATE|INSERT|CREATE|ON CLUSTER/);
    expect(dumps).toEqual([{ filename: SQL_PATH, sql: `${sql};` }]);
  });

  it('uses the replicated view and source when the injected environment is clustered', async () => {
    await up({ ...ENV, clickhouseCluster: true });
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = execute.mock.calls[0]?.[0]?.[0];
    expect(sql).toStartWith(
      "ALTER TABLE event_property_values_mv_replicated ON CLUSTER '{cluster}'\nMODIFY QUERY"
    );
    expect(sql).toContain('FROM events_replicated\n');
    expect(dumps).toHaveLength(1);
  });

  it('keeps the existing --cluster override', async () => {
    process.argv.push('--cluster');
    await up(ENV);
    expect(execute.mock.calls[0]?.[0]?.[0]).toContain("ON CLUSTER '{cluster}'");
  });

  it('does not replace injected configuration with the process environment', async () => {
    process.env.CLICKHOUSE_CLUSTER = 'true';
    await up(ENV);
    expect(execute.mock.calls[0]?.[0]?.[0]).not.toContain('ON CLUSTER');
  });

  it('writes only a mocked SQL dump during --dry and sends no DDL', async () => {
    process.argv.push('--dry');
    await up({ ...ENV, clickhouseCluster: true });
    expect(execute).not.toHaveBeenCalled();
    expect(dumps).toHaveLength(1);
    expect(dumps[0]?.filename).toBe(SQL_PATH);
    expect(dumps[0]?.sql).toContain('event_property_values_mv_replicated');
  });

  it('propagates execution failure after creating the mocked dump', async () => {
    const failure = new Error('Synthetic ClickHouse command failure');
    execute.mockRejectedValue(failure);
    await expect(up(ENV)).rejects.toBe(failure);
    expect(dumps).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not execute DDL if writing the SQL dump fails', async () => {
    rejectDump = true;
    await expect(up(ENV)).rejects.toThrow('Synthetic SQL dump failure');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('9001 migration identity and runner contract', () => {
  it('skips a completed migration by its full filename after the directory move', async () => {
    findMany.mockResolvedValue([{ name: NAME }]);
    expect(await runner.getPendingMigrations()).toEqual([
      '3-init-ch.ts',
      '19-event-property-values-projections.ts',
    ]);
    expect(execute).not.toHaveBeenCalled();
    expect(dumps).toHaveLength(0);
  });

  it('keeps an unfinished 9001 last and excludes its test and SQL dump', async () => {
    expect(await runner.getPendingMigrations()).toEqual([
      '3-init-ch.ts',
      '19-event-property-values-projections.ts',
      NAME,
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not treat another filename with prefix 9001 as this migration', async () => {
    findMany.mockResolvedValue([{ name: '9001-another-migration.ts' }]);
    expect(await runner.getPendingMigrations()).toContain(NAME);
  });

  it('records the unchanged full filename after a successful explicit run', async () => {
    await runner.runMigration(NAME, ENV);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { name: NAME },
      update: { name: NAME },
      create: { name: NAME },
    });
  });

  it('documents that an explicit run bypasses pending-file completion filtering', async () => {
    findMany.mockResolvedValue([{ name: NAME }]);
    await runner.runMigration(NAME, ENV);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not record a failed execution as finished', async () => {
    const failure = new Error('Synthetic failed migration');
    execute.mockRejectedValue(failure);
    await expect(runner.runMigration(NAME, ENV)).rejects.toBe(failure);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not execute or record during a mocked --dry run', async () => {
    process.argv.push('--dry');
    await runner.runMigration(NAME, ENV);
    expect(execute).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(dumps).toHaveLength(1);
  });

  it('honors --no-record without suppressing the migration command', async () => {
    process.argv.push('--no-record');
    await runner.runMigration(NAME, ENV);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('stops a mismatched topology before the migration writes even a dump', async () => {
    layout.mockResolvedValue({
      json: async () => [{ name: 'events', engine: 'Distributed' }],
    });
    await expect(runner.runMigration(NAME, ENV)).rejects.toThrow(
      'Refusing to migrate'
    );
    expect(dumps).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
