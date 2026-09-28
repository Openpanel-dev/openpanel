export interface IUploadOptions {
  bucket: string;
  key: string;
  content: Buffer | string;
  contentType: string;
}

export interface IUploadResult {
  bucket: string;
  key: string;
  etag?: string;
  location?: string;
}

export interface IObjectStoreAdapter {
  upload(options: IUploadOptions): Promise<IUploadResult>;

  uploadMany(
    options: Array<IUploadOptions>
  ): Promise<Array<IUploadResult | Error>>;

  testConnection(): Promise<{ success: boolean; error?: string }>;
}
