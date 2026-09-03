// Ported from @openpanel/integrations (dissolved into core — M4-005).

export { createGCSAdapter, GCSAdapter } from './gcs-adapter';
export { createS3Adapter, S3Adapter } from './s3-adapter';
export type {
  IObjectStoreAdapter,
  IUploadOptions,
  IUploadResult,
} from './types';
