import type { ExportFormat, IBatchInfo } from './batch-creator';

/**
 * Manifest file structure
 * This file is uploaded LAST to signal that the batch is complete and ready for loading
 */
export interface IManifest {
  batch_id: string;
  project_id: string;
  integration_id: string;
  format: ExportFormat;
  files: string[];
  record_count: number;
  min_event_time: string;
  max_event_time: string;
  schema_version: number;
  created_at: string;
  partition_date: string; // YYYY-MM-DD
  partition_hour: string; // HH
}

const CURRENT_SCHEMA_VERSION = 1;

export function createManifest(
  batchInfo: IBatchInfo,
  fileNames: string[]
): IManifest {
  return {
    batch_id: batchInfo.batchId,
    project_id: batchInfo.projectId,
    integration_id: batchInfo.integrationId,
    format: batchInfo.format,
    files: fileNames,
    record_count: batchInfo.recordCount,
    min_event_time: batchInfo.minEventTime,
    max_event_time: batchInfo.maxEventTime,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: batchInfo.createdAt,
    partition_date: batchInfo.partitionDate,
    partition_hour: batchInfo.partitionHour,
  };
}

export function serializeManifest(manifest: IManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function parseManifest(json: string): IManifest {
  return JSON.parse(json) as IManifest;
}

export const MANIFEST_FILENAME = 'manifest.json';

export const MANIFEST_CONTENT_TYPE = 'application/json';
