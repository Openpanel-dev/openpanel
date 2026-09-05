// Moved from apps/worker/src/jobs/cron.flush-exports.test.ts (M9-003), plus
// the orchestration half V1 never covered: `runFlushExportsCron` now takes
// injected deps, so the fan-out, the watermark advance and the manifest-last
// upload order can be asserted with no infrastructure at all.

import { describe, expect, it, mock } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import {
  clickhouseEventToExportEvent,
  createBatch,
  createManifest,
  generateBatchPath,
  MANIFEST_CONTENT_TYPE,
  MANIFEST_FILENAME,
  parseManifest,
  serializeManifest,
} from '../../../clients/integrations/export';
import { createGCSAdapter } from '../../../clients/integrations/object-store/gcs-adapter';
import type { Logger } from '../../../logger';
import {
  type ExportIntegrationRow,
  type ExportWatermarkRow,
  type FlushExportsDeps,
  runFlushExportsCron,
} from './flush-exports';

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

const chEvent = (i: number) =>
  ({
    id: `00000000-0000-0000-0000-00000000000${i}`,
    project_id: 'proj_1',
    name: 'screen_view',
    created_at: `2026-08-26 10:0${i}:00.000`,
    inserted_at: `2026-08-26 11:0${i}:00.000`,
    profile_id: `user_${i}`,
    device_id: `dev_${i}`,
    session_id: `sess_${i}`,
    properties: { __path: `/p/${i}`, n: i },
    country: 'SE',
    city: 'Stockholm',
    region: 'AB',
    os: 'macOS',
    browser: 'Chrome',
    device: 'desktop',
    path: `/p/${i}`,
    origin: 'https://openpanel.dev',
    referrer: '',
  }) as never;

const gcsIntegration: ExportIntegrationRow = {
  id: 'int_1',
  organizationId: 'org_1',
  projectId: 'proj_1',
  config: {
    type: 'gcs_export',
    bucket: 'op-bucket',
    prefix: 'openpanel-exports',
    format: 'jsonl_gzip',
    serviceAccountKey: 'unused — the adapter is stubbed',
  } as never,
};

const watermark: ExportWatermarkRow = {
  lastInsertedAt: new Date('2026-08-26T09:00:00.000Z'),
  lastEventId: '00000000-0000-0000-0000-000000000000',
};

function fakeDeps(rows: unknown[][]) {
  const uploads: { key: string; contentType: string }[] = [];
  const watermarkUpdates: unknown[] = [];
  const windows = [...rows];
  const query = mock(async () => ({
    json: async () => windows.shift() ?? [],
  }));

  const deps: FlushExportsDeps = {
    db: {
      integration: { findMany: async () => [gcsIntegration] },
      project: { findMany: async () => [] },
      exportWatermark: {
        findUnique: async () => watermark,
        create: async () => ({}),
        update: async (args) => {
          watermarkUpdates.push(args);
          return {};
        },
      },
    },
    ch: { query } as unknown as FlushExportsDeps['ch'],
    logger: stubLogger(),
    createAdapter: () =>
      ({
        upload: async ({
          key,
          contentType,
        }: {
          key: string;
          contentType: string;
        }) => {
          uploads.push({ key, contentType });
          return { key };
        },
      }) as never,
  };

  return { deps, uploads, watermarkUpdates, query };
}

describe('runFlushExportsCron', () => {
  it('uploads the data files before the manifest and advances the watermark', async () => {
    const { deps, uploads, watermarkUpdates } = fakeDeps([
      [1, 2, 3].map(chEvent),
    ]);

    await runFlushExportsCron(deps);

    expect(uploads).toHaveLength(2);
    expect(uploads[0]?.key).toContain('part-0000.jsonl.gz');
    // The manifest is the commit marker: it must land last.
    expect(uploads[1]?.key.endsWith(`/${MANIFEST_FILENAME}`)).toBe(true);
    expect(uploads[1]?.contentType).toBe(MANIFEST_CONTENT_TYPE);

    expect(watermarkUpdates).toHaveLength(1);
    expect(watermarkUpdates[0]).toMatchObject({
      data: {
        lastEventId: '00000000-0000-0000-0000-000000000003',
        lastInsertedAt: new Date('2026-08-26T11:03:00.000Z'),
      },
    });
  });

  it('does nothing when no integration declares an export capability', async () => {
    const { deps, uploads } = fakeDeps([]);
    deps.db.integration.findMany = async () => [
      { ...gcsIntegration, config: { type: 'slack' } as never },
    ];

    await runFlushExportsCron(deps);

    expect(uploads).toHaveLength(0);
  });

  it('stops draining once a short window comes back', async () => {
    const { deps, query } = fakeDeps([[1, 2].map(chEvent)]);

    await runFlushExportsCron(deps);

    // Two rows is far under BATCH_SIZE, so one window is the whole backlog.
    expect(query).toHaveBeenCalledTimes(1);
  });
});

/**
 * Exercises the object-store export path end to end against a local
 * fake-gcs-server (see clients/integrations/object-store/gcs-adapter.test.ts
 * for how to start it). The job's own ClickHouse/Postgres I/O is out of scope
 * here; what this pins down is the part a consumer depends on — batch files
 * land, then a manifest that points at them, under the partitioned path.
 *
 * Skips when the emulator isn't reachable.
 */
const EMULATOR = process.env.GCS_API_ENDPOINT ?? 'http://localhost:4443';
const BUCKET = 'op-flush-exports-test';
const EMULATOR_TIMEOUT_MS = 2000;
const EMULATOR_TEST_TIMEOUT_MS = 60_000;

async function emulatorReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${EMULATOR}/storage/v1/b`, {
      signal: AbortSignal.timeout(EMULATOR_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await emulatorReachable();

// A structurally complete service account document. fake-gcs-server does no
// auth, but the adapter pins the credential type and requires the fields a real
// key has before it will build a client.
const KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'openpanel-test',
  client_email: 'e@x.iam.gserviceaccount.com',
  private_key: 'test-private-key',
});

describe.skipIf(!available)('flush-exports -> GCS end to end', () => {
  it(
    'writes batch files then a manifest that points at them',
    async () => {
      process.env.GCS_API_ENDPOINT = EMULATOR;
      await fetch(`${EMULATOR}/storage/v1/b`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: BUCKET }),
      });

      const config = {
        type: 'gcs_export' as const,
        bucket: BUCKET,
        prefix: 'openpanel-exports',
        format: 'jsonl_gzip' as const,
        serviceAccountKey: KEY,
      };
      const adapter = createGCSAdapter(config);

      // --- exactly what processExport() does ---
      const events = [1, 2, 3].map(chEvent).map(clickhouseEventToExportEvent);
      const batch = await createBatch('proj_1', 'int_1', events, 'jsonl_gzip');
      const basePath = generateBatchPath(
        config.prefix,
        'proj_1',
        'int_1',
        batch.info.batchId,
        new Date(batch.info.minEventTime)
      );

      for (const file of batch.files) {
        await adapter.upload({
          bucket: config.bucket,
          key: `${basePath}/${file.filename}`,
          content: file.content,
          contentType: file.contentType,
        });
      }
      const manifest = createManifest(
        batch.info,
        batch.files.map((f) => f.filename)
      );
      await adapter.upload({
        bucket: config.bucket,
        key: `${basePath}/${MANIFEST_FILENAME}`,
        content: serializeManifest(manifest),
        contentType: MANIFEST_CONTENT_TYPE,
      });
      // --- end ---

      const read = async (key: string) => {
        const res = await fetch(
          `${EMULATOR}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(key)}?alt=media`
        );
        expect(res.ok).toBe(true);
        return Buffer.from(await res.arrayBuffer());
      };

      const storedManifest = parseManifest(
        (await read(`${basePath}/${MANIFEST_FILENAME}`)).toString()
      );
      expect(storedManifest.record_count).toBe(3);
      expect(storedManifest.files).toEqual(['part-0000.jsonl.gz']);
      expect(storedManifest.partition_date).toBe('2026-08-26');

      const lines = gunzipSync(
        await read(`${basePath}/${storedManifest.files[0]}`)
      )
        .toString()
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

      expect(lines).toHaveLength(3);
      expect(lines[0].event_name).toBe('screen_view');
      expect(lines[0].project_id).toBe('proj_1');
      expect(lines.map((l) => l.path)).toEqual(['/p/1', '/p/2', '/p/3']);
    },
    EMULATOR_TEST_TIMEOUT_MS
  );
});
