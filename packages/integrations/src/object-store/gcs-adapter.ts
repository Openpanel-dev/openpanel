import { Storage } from '@google-cloud/storage';
import { decryptCredential } from '@openpanel/common/server';
import { createLogger } from '@openpanel/logger';
import { type IGCSExportConfig, parseServiceAccountKey } from '@openpanel/validation';

import type {
  IObjectStoreAdapter,
  IUploadOptions,
  IUploadResult,
} from './types';

const logger = createLogger({ name: 'gcs-adapter' });

/** Object written by `testConnection`; named so it is obvious in a bucket. */
const CONNECTION_TEST_FILENAME = '.openpanel-connection-test';

/**
 * GCS Adapter for uploading export batches to Google Cloud Storage
 * Uses service account credentials for authentication
 */
export class GCSAdapter implements IObjectStoreAdapter {
  private config: IGCSExportConfig;
  private storage: Storage | null = null;

  constructor(config: IGCSExportConfig) {
    // Decrypt the service account key if encrypted
    this.config = {
      ...config,
      serviceAccountKey: decryptCredential(config.serviceAccountKey),
    };
  }

  /**
   * Get or create a GCS Storage client
   */
  private getStorage(): Storage {
    if (this.storage) {
      return this.storage;
    }

    // Parse and pin the credential document BEFORE it reaches the SDK.
    //
    // `new Storage({ credentials })` forwards the raw object to GoogleAuth,
    // which dispatches on its `type`: an `external_account` document would be
    // routed to ExternalAccountClient, whose `credential_source` gives the
    // document's author arbitrary local file reads and unguarded outbound
    // requests, with the result POSTed to an attacker-chosen `token_url`. The
    // config is tenant-supplied, so that dispatch must be unreachable.
    //
    // The zod schema rejects non-service-account documents on the way in; this
    // is the load-bearing check, covering rows written before that schema and
    // any future caller that skips it.
    const parsed = parseServiceAccountKey(this.config.serviceAccountKey);
    if (!parsed.ok) {
      logger.error({ reason: parsed.error }, 'Rejected GCS credential document');
      throw new Error(`Invalid service account key: ${parsed.error}`);
    }
    const { credentials } = parsed;

    try {
      // Endpoint override. Real GCS needs none (the SDK resolves it), but
      // pointing the client at a local fake-gcs-server is the only way to
      // exercise this adapter without live Google credentials — the same
      // escape hatch the S3 adapter has via `endpoint`.
      //
      // Deliberately NOT the SDK's own `STORAGE_EMULATOR_HOST`: in v7 that var
      // is applied to the JSON API base but not the upload base, so metadata
      // reads and uploads can't both resolve. `apiEndpoint` sets both.
      const apiEndpoint = process.env.GCS_API_ENDPOINT;

      this.storage = new Storage({
        // Allowlisted fields only, and deliberately WITHOUT `type`: with no
        // recognised type GoogleAuth can only fall through to its JWT branch,
        // which needs exactly client_email + private_key.
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
          ...(credentials.private_key_id
            ? { private_key_id: credentials.private_key_id }
            : {}),
          ...(credentials.universe_domain
            ? { universe_domain: credentials.universe_domain }
            : {}),
        },
        projectId: credentials.project_id,
        ...(apiEndpoint ? { apiEndpoint } : {}),
      });

      logger.debug(
        {
          projectId: credentials.project_id,
        },
        'GCS client created',
      );

      return this.storage;
    } catch (error) {
      logger.error({ error }, 'Failed to create GCS client');
      throw new Error('Failed to create GCS client');
    }
  }

  /**
   * Upload a single file to GCS
   */
  async upload(options: IUploadOptions): Promise<IUploadResult> {
    const storage = this.getStorage();
    const bucket = storage.bucket(options.bucket);
    const file = bucket.file(options.key);

    try {
      const content =
        typeof options.content === 'string'
          ? Buffer.from(options.content)
          : options.content;

      await file.save(content, {
        contentType: options.contentType,
        resumable: false, // For small files, non-resumable is faster
        metadata: {
          contentType: options.contentType,
        },
      });

      // `save` populates `file.metadata` from the upload response, so re-reading
      // it with getMetadata() would double the request count of every export.
      const metadata = file.metadata;

      logger.debug(
        {
          bucket: options.bucket,
          key: options.key,
          generation: metadata?.generation,
        },
        'File uploaded to GCS',
      );

      return {
        bucket: options.bucket,
        key: options.key,
        etag: metadata?.etag || undefined,
        location: `gs://${options.bucket}/${options.key}`,
      };
    } catch (error) {
      logger.error(
        {
          error,
          bucket: options.bucket,
          key: options.key,
        },
        'Failed to upload file to GCS',
      );
      throw error;
    }
  }

  /**
   * Upload multiple files to GCS
   */
  async uploadMany(
    options: Array<IUploadOptions>,
  ): Promise<Array<IUploadResult | Error>> {
    const results = await Promise.allSettled(
      options.map((opt) => this.upload(opt)),
    );

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return result.reason instanceof Error
        ? result.reason
        : new Error(String(result.reason));
    });
  }

  /**
   * Test the connection by writing a probe object.
   *
   * Deliberately not `bucket.exists()`: reading bucket metadata needs
   * `storage.buckets.get`, which the least-privilege grant for an export target
   * (roles/storage.objectCreator, roles/storage.objectAdmin) does NOT include.
   * That check fails with a 403 on a correctly configured bucket while the
   * export itself would work fine. Writing an object exercises exactly the
   * permission the export needs, so a pass here means a pass at flush time.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const storage = this.getStorage();
      const bucket = storage.bucket(this.config.bucket);
      const prefix = this.config.prefix || 'openpanel-exports';
      const file = bucket.file(`${prefix}/${CONNECTION_TEST_FILENAME}`);

      await file.save(Buffer.from('openpanel connection test\n'), {
        contentType: 'text/plain',
        resumable: false,
      });

      // Best effort: objectCreator can write but not delete, and a stray
      // zero-value probe object must not turn a working setup into a failure.
      await file.delete().catch(() => undefined);

      return { success: true };
    } catch (error) {
      return { success: false, error: this.describeError(error) };
    }
  }

  /** Turn an SDK error into something a user can act on. */
  private describeError(error: unknown): string {
    const code = (error as { code?: number } | null)?.code;

    if (code === 404) {
      return `Bucket '${this.config.bucket}' does not exist or is not accessible`;
    }
    if (code === 401 || code === 403) {
      return `The service account cannot write to bucket '${this.config.bucket}'. Grant it roles/storage.objectAdmin (or objectCreator) on the bucket.`;
    }

    return error instanceof Error ? error.message : 'Unknown error';
  }
}

/**
 * Create a GCS adapter from integration config
 */
export function createGCSAdapter(config: IGCSExportConfig): GCSAdapter {
  return new GCSAdapter(config);
}
