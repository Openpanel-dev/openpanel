import {
  HeadBucketCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { assertSafeUrl, decryptCredential } from '@openpanel/common/server';
import { createLogger } from '@openpanel/logger';
import type { IS3ExportConfig } from '@openpanel/validation';

import type {
  IObjectStoreAdapter,
  IUploadOptions,
  IUploadResult,
} from './types';

const logger = createLogger({ name: 's3-adapter' });

/**
 * S3 Adapter for uploading export batches to AWS S3 or S3-compatible storage
 * Supports two authentication modes:
 * - IAM role assumption (AWS best practice)
 * - Access keys (for R2, MinIO, DigitalOcean Spaces, etc.)
 */
export class S3Adapter implements IObjectStoreAdapter {
  private config: IS3ExportConfig;
  private clientPromise: Promise<S3Client> | null = null;
  private clientExpiresAt = 0;

  constructor(config: IS3ExportConfig) {
    // Decrypt secretAccessKey if present and encrypted
    if (config.authMode === 'access_key') {
      this.config = {
        ...config,
        secretAccessKey: decryptCredential(config.secretAccessKey),
      };
    } else {
      this.config = config;
    }
  }

  /**
   * Get or create an S3 client based on auth mode
   */
  private async getClient(): Promise<S3Client> {
    // A custom endpoint is tenant-controlled; SSRF-guard the resolved host
    // before connecting (no-op on self-hosted). Default AWS endpoints are safe.
    if (this.config.endpoint) {
      await assertSafeUrl(this.config.endpoint);
    }
    if (this.config.authMode === 'iam_role') {
      return this.getClientWithAssumedRole();
    }
    return this.getClientWithAccessKeys();
  }

  /**
   * Get or create an S3 client using static access keys
   * For R2, MinIO, DigitalOcean Spaces, etc.
   */
  private getClientWithAccessKeys(): S3Client {
    // Access key clients don't expire, reuse if available
    if (this.clientPromise && this.clientExpiresAt === 0) {
      return this.clientPromise as unknown as S3Client;
    }

    if (this.config.authMode !== 'access_key') {
      throw new Error('Access key auth mode required but IAM role config provided');
    }

    const client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      // For R2, MinIO, etc.: force path-style addressing
      forcePathStyle: !!this.config.endpoint,
    });

    logger.debug(
      {
        region: this.config.region,
        endpoint: this.config.endpoint || 'default',
      },
      'S3 client created with access keys',
    );

    // Mark as non-expiring
    this.clientExpiresAt = 0;
    this.clientPromise = Promise.resolve(client);

    return client;
  }

  /**
   * Get or create an S3 client with assumed role credentials
   */
  private async getClientWithAssumedRole(): Promise<S3Client> {
    const now = Date.now();

    // Reuse client if credentials haven't expired (with 5 min buffer)
    if (this.clientPromise && this.clientExpiresAt > now + 5 * 60 * 1000) {
      return this.clientPromise;
    }

    this.clientPromise = this.createClientWithAssumedRole();
    return this.clientPromise;
  }

  /**
   * Create an S3 client by assuming the customer's IAM role
   */
  private async createClientWithAssumedRole(): Promise<S3Client> {
    if (this.config.authMode !== 'iam_role') {
      throw new Error('IAM role auth mode required but access key config provided');
    }

    const stsClient = new STSClient({ region: this.config.region });

    const assumeRoleParams: {
      RoleArn: string;
      RoleSessionName: string;
      DurationSeconds: number;
      ExternalId?: string;
    } = {
      RoleArn: this.config.roleArn,
      RoleSessionName: 'OpenPanelExport',
      DurationSeconds: 3600, // 1 hour
    };

    if (this.config.externalId) {
      assumeRoleParams.ExternalId = this.config.externalId;
    }

    try {
      const assumeRoleCommand = new AssumeRoleCommand(assumeRoleParams);
      const assumeRoleResponse = await stsClient.send(assumeRoleCommand);

      const credentials = assumeRoleResponse.Credentials;
      if (!credentials) {
        throw new Error('Failed to assume role: no credentials returned');
      }

      // Track when credentials expire
      this.clientExpiresAt =
        credentials.Expiration?.getTime() || Date.now() + 3600 * 1000;

      const s3Client = new S3Client({
        region: this.config.region,
        credentials: {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken,
        },
      });

      logger.debug(
        {
          roleArn: this.config.roleArn,
          expiresAt: new Date(this.clientExpiresAt).toISOString(),
        },
        'S3 client created with assumed role',
      );

      return s3Client;
    } catch (error) {
      logger.error(
        {
          error,
          roleArn: this.config.roleArn,
        },
        'Failed to assume role for S3 access',
      );
      throw error;
    }
  }

  /**
   * Get encryption parameters based on config
   */
  private getEncryptionParams(): Partial<PutObjectCommandInput> {
    const encryption = this.config.encryption || 'SSE-S3';

    switch (encryption) {
      case 'SSE-S3':
        return {
          ServerSideEncryption: 'AES256',
        };
      case 'SSE-KMS':
        return {
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: this.config.kmsKeyId,
        };
      case 'none':
        return {};
      default:
        return {
          ServerSideEncryption: 'AES256',
        };
    }
  }

  /**
   * Upload a single file to S3
   */
  async upload(options: IUploadOptions): Promise<IUploadResult> {
    const client = await this.getClient();

    const putParams: PutObjectCommandInput = {
      Bucket: options.bucket,
      Key: options.key,
      Body: options.content,
      ContentType: options.contentType,
      ...this.getEncryptionParams(),
    };

    try {
      const command = new PutObjectCommand(putParams);
      const response = await client.send(command);

      logger.debug(
        {
          bucket: options.bucket,
          key: options.key,
          etag: response.ETag,
        },
        'File uploaded to S3',
      );

      return {
        bucket: options.bucket,
        key: options.key,
        etag: response.ETag,
        location: `s3://${options.bucket}/${options.key}`,
      };
    } catch (error) {
      logger.error(
        {
          error,
          bucket: options.bucket,
          key: options.key,
        },
        'Failed to upload file to S3',
      );
      throw error;
    }
  }

  /**
   * Upload multiple files to S3
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
   * Test the connection to S3 bucket
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.getClient();

      const command = new HeadBucketCommand({
        Bucket: this.config.bucket,
      });

      await client.send(command);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

/**
 * Create an S3 adapter from integration config
 */
export function createS3Adapter(config: IS3ExportConfig): S3Adapter {
  return new S3Adapter(config);
}
