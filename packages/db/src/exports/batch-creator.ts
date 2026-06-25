import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { generateSecureId } from '@openpanel/common/server';
import { createLogger } from '@openpanel/logger';

import type { IExportEvent } from './export-event';

const logger = createLogger({ name: 'batch-creator' });

/**
 * Supported export formats
 */
export type ExportFormat = 'jsonl_gzip' | 'parquet';

/**
 * Batch metadata for tracking
 */
export interface IBatchInfo {
  batchId: string;
  projectId: string;
  integrationId: string;
  format: ExportFormat;
  recordCount: number;
  minEventTime: string;
  maxEventTime: string;
  createdAt: string;
  // Partition info
  partitionDate: string; // YYYY-MM-DD
  partitionHour: string; // HH
}

/**
 * Created batch file info
 */
export interface IBatchFile {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Result of creating a batch
 */
export interface IBatchResult {
  info: IBatchInfo;
  files: IBatchFile[];
}

/**
 * Generate the object path for a batch
 * Layout: {prefix}/project_id={projectId}/integration_id={integrationId}/dt=YYYY-MM-DD/hour=HH/batch_id={batchId}/
 */
export function generateBatchPath(
  prefix: string,
  projectId: string,
  integrationId: string,
  batchId: string,
  date: Date,
): string {
  const dt = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = date.getUTCHours().toString().padStart(2, '0'); // HH

  return [
    prefix,
    `project_id=${projectId}`,
    `integration_id=${integrationId}`,
    `dt=${dt}`,
    `hour=${hour}`,
    `batch_id=${batchId}`,
  ].join('/');
}

/**
 * Get file extension for format
 */
export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'jsonl_gzip':
      return 'jsonl.gz';
    case 'parquet':
      return 'parquet';
  }
}

/**
 * Get content type for format
 */
export function getContentType(format: ExportFormat): string {
  switch (format) {
    case 'jsonl_gzip':
      return 'application/gzip';
    case 'parquet':
      return 'application/vnd.apache.parquet';
  }
}

/**
 * Extract the min/max event time across a batch (used for partitioning + the
 * manifest time range).
 */
function eventTimeRange(events: IExportEvent[]): {
  minEventTime: string;
  maxEventTime: string;
} {
  let minTime: Date | null = null;
  let maxTime: Date | null = null;

  for (const event of events) {
    const eventTime = new Date(event.event_time);
    if (!minTime || eventTime < minTime) {
      minTime = eventTime;
    }
    if (!maxTime || eventTime > maxTime) {
      maxTime = eventTime;
    }
  }

  return {
    minEventTime: minTime?.toISOString() || new Date().toISOString(),
    maxEventTime: maxTime?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Create JSONL content from events
 */
function createJsonlContent(events: IExportEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

/**
 * Gzip compress content
 */
async function gzipCompress(content: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const gzip = createGzip({ level: 6 });
  const source = Readable.from([content]);

  await pipeline(source, gzip, async function* (source) {
    for await (const chunk of source) {
      chunks.push(chunk as Buffer);
    }
  });

  return Buffer.concat(chunks);
}

/**
 * Create a batch of events in the specified format
 */
export async function createBatch(
  projectId: string,
  integrationId: string,
  events: IExportEvent[],
  format: ExportFormat = 'jsonl_gzip',
): Promise<IBatchResult> {
  const batchId = generateSecureId('batch');
  const now = new Date();

  if (events.length === 0) {
    throw new Error('No valid events to create batch');
  }

  const { minEventTime, maxEventTime } = eventTimeRange(events);

  // Determine partition based on min event time
  const partitionDate = new Date(minEventTime);
  const dt = partitionDate.toISOString().split('T')[0]!;
  const hour = partitionDate.getUTCHours().toString().padStart(2, '0');

  const info: IBatchInfo = {
    batchId,
    projectId,
    integrationId,
    format,
    recordCount: events.length,
    minEventTime,
    maxEventTime,
    createdAt: now.toISOString(),
    partitionDate: dt,
    partitionHour: hour,
  };

  const files: IBatchFile[] = [];

  switch (format) {
    case 'jsonl_gzip': {
      const jsonlContent = createJsonlContent(events);
      const gzippedContent = await gzipCompress(jsonlContent);

      files.push({
        filename: `part-0000.${getFileExtension(format)}`,
        content: gzippedContent,
        contentType: getContentType(format),
      });
      break;
    }
    case 'parquet': {
      // Parquet support to be implemented later
      throw new Error('Parquet format not yet implemented');
    }
  }

  logger.info(
    {
      batchId,
      projectId,
      integrationId,
      format,
      recordCount: events.length,
      partitionDate: dt,
      partitionHour: hour,
    },
    'Batch created',
  );

  return { info, files };
}
