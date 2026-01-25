/**
 * Common types for object store adapters
 */

/**
 * Upload options for object store adapters
 */
export interface IUploadOptions {
  bucket: string;
  key: string;
  content: Buffer | string;
  contentType: string;
}

/**
 * Result of an upload operation
 */
export interface IUploadResult {
  bucket: string;
  key: string;
  etag?: string;
  location?: string;
}

/**
 * Object store adapter interface
 */
export interface IObjectStoreAdapter {
  /**
   * Upload a file to object storage
   */
  upload(options: IUploadOptions): Promise<IUploadResult>;

  /**
   * Upload multiple files to object storage
   */
  uploadMany(
    options: Array<IUploadOptions>,
  ): Promise<Array<IUploadResult | Error>>;

  /**
   * Check if the adapter is properly configured and can connect
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}
