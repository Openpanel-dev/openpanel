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
} from '@openpanel/db/src/exports';
import { createGCSAdapter } from '@openpanel/integrations/src/object-store';
import { describe, expect, it } from 'vitest';

/**
 * Exercises the object-store export path end to end against a local
 * fake-gcs-server (see gcs-adapter.test.ts for how to start it). The job's own
 * ClickHouse/Postgres I/O is out of scope here; what this pins down is the part
 * a consumer depends on — batch files land, then a manifest that points at
 * them, under the partitioned path.
 *
 * Skips when the emulator isn't reachable.
 */
const EMULATOR = process.env.GCS_API_ENDPOINT ?? 'http://localhost:4443';
const BUCKET = 'op-flush-exports-test';

async function emulatorReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${EMULATOR}/storage/v1/b`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await emulatorReachable();

const KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'openpanel-test',
  client_email: 'e@x.iam.gserviceaccount.com',
});

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

describe.skipIf(!available)('flush-exports -> GCS end to end', () => {
  it('writes batch files then a manifest that points at them', async () => {
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
      new Date(batch.info.minEventTime),
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
      batch.files.map((f) => f.filename),
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
        `${EMULATOR}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(key)}?alt=media`,
      );
      expect(res.ok).toBe(true);
      return Buffer.from(await res.arrayBuffer());
    };

    const storedManifest = parseManifest(
      (await read(`${basePath}/${MANIFEST_FILENAME}`)).toString(),
    );
    expect(storedManifest.record_count).toBe(3);
    expect(storedManifest.files).toEqual(['part-0000.jsonl.gz']);
    expect(storedManifest.partition_date).toBe('2026-08-26');

    const lines = gunzipSync(await read(`${basePath}/${storedManifest.files[0]}`))
      .toString()
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    expect(lines).toHaveLength(3);
    expect(lines[0].event_name).toBe('screen_view');
    expect(lines[0].project_id).toBe('proj_1');
    expect(lines.map((l) => l.path)).toEqual(['/p/1', '/p/2', '/p/3']);
  }, 60_000);
});
