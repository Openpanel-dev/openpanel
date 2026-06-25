import { Storage } from '@google-cloud/storage';
import { decryptCredential } from '@openpanel/common/server';
import { createLogger } from '@openpanel/logger';
import type { IGCSExportConfig } from '@openpanel/validation';

import type {
  IObjectStoreAdapter,
  IUploadOptions,
  IUploadResult,
} from './types';

const logger = createLogger({ name: 'gcs-adapter' });

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

    try {
      // Parse the service account key JSON
      const credentials = JSON.parse(this.config.serviceAccountKey);

      this.storage = new Storage({
        credentials,
        projectId: credentials.project_id,
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
      throw new Error('Invalid service account key JSON');
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

      // Get file metadata to retrieve the generation (similar to etag)
      const [metadata] = await file.getMetadata();

      logger.debug(
        {
          bucket: options.bucket,
          key: options.key,
          generation: metadata.generation,
        },
        'File uploaded to GCS',
      );

      return {
        bucket: options.bucket,
        key: options.key,
        etag: metadata.etag || undefined,
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
   * Test the connection to GCS bucket
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const storage = this.getStorage();
      const bucket = storage.bucket(this.config.bucket);

      // Check if bucket exists and we have access
      const [exists] = await bucket.exists();

      if (!exists) {
        return {
          success: false,
          error: `Bucket '${this.config.bucket}' does not exist or is not accessible`,
        };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

/**
 * Create a GCS adapter from integration config
 */
export function createGCSAdapter(config: IGCSExportConfig): GCSAdapter {
  return new GCSAdapter(config);
}
