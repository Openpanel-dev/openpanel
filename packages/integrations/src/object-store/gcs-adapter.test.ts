import { gunzipSync, gzipSync } from 'node:zlib';
import { encryptCredential } from '@openpanel/common/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGCSAdapter } from './gcs-adapter';

/**
 * Integration tests for the GCS adapter, run against a local fake-gcs-server.
 *
 * The Google SDK offers no in-process test double and real GCS needs live
 * credentials, so this is the only way to prove the adapter actually speaks the
 * GCS API rather than merely type-checking. Start the emulator with:
 *
 *   docker run -d --name fake-gcs -p 4443:4443 fsouza/fake-gcs-server \
 *     -scheme http -host 0.0.0.0 -port 4443 -public-host localhost:4443
 *
 * The whole suite skips when it isn't reachable, so `pnpm test` stays green
 * without Docker.
 */
const EMULATOR = process.env.GCS_API_ENDPOINT ?? 'http://localhost:4443';
const BUCKET = 'op-gcs-adapter-test';

// A structurally valid service account key. fake-gcs-server does no auth, and
// the SDK skips token exchange when pointed at a custom endpoint, so the key is
// only ever parsed — never used to sign.
const SERVICE_ACCOUNT_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'openpanel-test',
  private_key_id: 'test-key-id',
  private_key: 'test-private-key',
  client_email: 'exporter@openpanel-test.iam.gserviceaccount.com',
  client_id: '000000000000000000000',
});

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

async function createBucket(name: string): Promise<void> {
  await fetch(`${EMULATOR}/storage/v1/b`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

async function readObject(bucket: string, key: string): Promise<Buffer> {
  const res = await fetch(
    `${EMULATOR}/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}?alt=media`,
  );
  if (!res.ok) {
    throw new Error(`Object ${key} not readable: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function adapter(overrides: { bucket?: string; serviceAccountKey?: string } = {}) {
  return createGCSAdapter({
    type: 'gcs_export',
    bucket: overrides.bucket ?? BUCKET,
    prefix: 'openpanel-exports',
    format: 'jsonl_gzip',
    serviceAccountKey: overrides.serviceAccountKey ?? SERVICE_ACCOUNT_KEY,
  });
}

const available = await emulatorReachable();

describe.skipIf(!available)('GCSAdapter (fake-gcs-server)', () => {
  beforeAll(async () => {
    process.env.GCS_API_ENDPOINT = EMULATOR;
    await createBucket(BUCKET);
  });

  describe('testConnection', () => {
    it('succeeds when the service account can write to the bucket', async () => {
      await expect(adapter().testConnection()).resolves.toEqual({
        success: true,
      });
    });

    it('cleans up the probe object it wrote', async () => {
      await adapter().testConnection();

      await expect(
        readObject(BUCKET, 'openpanel-exports/.openpanel-connection-test'),
      ).rejects.toThrow();
    });

    it('fails with a readable message when the bucket does not exist', async () => {
      const res = await adapter({ bucket: 'no-such-bucket' }).testConnection();

      expect(res.success).toBe(false);
      expect(res.error).toBe(
        "Bucket 'no-such-bucket' does not exist or is not accessible",
      );
    });

    it('fails instead of throwing on an unparseable service account key', async () => {
      const res = await adapter({
        serviceAccountKey: 'not-json',
      }).testConnection();

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid service account key JSON');
    });
  });

  describe('upload', () => {
    it('stores the bytes and reports where they went', async () => {
      const key = 'upload/plain.txt';
      const result = await adapter().upload({
        bucket: BUCKET,
        key,
        content: Buffer.from('hello openpanel'),
        contentType: 'text/plain',
      });

      expect(result).toMatchObject({
        bucket: BUCKET,
        key,
        location: `gs://${BUCKET}/${key}`,
      });
      expect(result.etag).toBeTruthy();
      expect((await readObject(BUCKET, key)).toString()).toBe('hello openpanel');
    });

    it('accepts string content', async () => {
      const key = 'upload/string.json';
      await adapter().upload({
        bucket: BUCKET,
        key,
        content: '{"a":1}',
        contentType: 'application/json',
      });

      expect((await readObject(BUCKET, key)).toString()).toBe('{"a":1}');
    });

    it('round-trips gzipped bytes without corruption', async () => {
      // The export format is jsonl_gzip, so a byte-exact binary round trip is
      // the property that actually matters here.
      const key = 'upload/part-0000.jsonl.gz';
      const jsonl = `${['a', 'b', 'c']
        .map((name, i) => JSON.stringify({ name, i }))
        .join('\n')}\n`;
      const gzipped = gzipSync(Buffer.from(jsonl));

      await adapter().upload({
        bucket: BUCKET,
        key,
        content: gzipped,
        contentType: 'application/gzip',
      });

      const stored = await readObject(BUCKET, key);
      expect(stored.equals(gzipped)).toBe(true);
      expect(gunzipSync(stored).toString()).toBe(jsonl);
    });

    it('decrypts an encrypted service account key', async () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      const key = 'upload/encrypted-creds.txt';

      await adapter({
        serviceAccountKey: encryptCredential(SERVICE_ACCOUNT_KEY),
      }).upload({
        bucket: BUCKET,
        key,
        content: 'ok',
        contentType: 'text/plain',
      });

      expect((await readObject(BUCKET, key)).toString()).toBe('ok');
    });
  });

  describe('uploadMany', () => {
    it('uploads every file and preserves input order', async () => {
      const results = await adapter().uploadMany(
        [0, 1, 2].map((i) => ({
          bucket: BUCKET,
          key: `many/file-${i}.txt`,
          content: `content-${i}`,
          contentType: 'text/plain',
        })),
      );

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result).not.toBeInstanceOf(Error);
        expect((result as { key: string }).key).toBe(`many/file-${i}.txt`);
      });
      expect((await readObject(BUCKET, 'many/file-1.txt')).toString()).toBe(
        'content-1',
      );
    });

    it('returns failures as Errors rather than rejecting the whole batch', async () => {
      // One good target, one bucket that does not exist: the caller must still
      // learn which uploads landed, so a partial failure can't lose the rest.
      const results = await adapter().uploadMany([
        {
          bucket: BUCKET,
          key: 'partial/ok.txt',
          content: 'ok',
          contentType: 'text/plain',
        },
        {
          bucket: 'no-such-bucket',
          key: 'partial/bad.txt',
          content: 'bad',
          contentType: 'text/plain',
        },
      ]);

      expect(results[0]).not.toBeInstanceOf(Error);
      expect(results[1]).toBeInstanceOf(Error);
    });
  });
});
