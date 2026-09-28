import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { generateSecureId } from '@openpanel/shared';
import type { Logger } from '../../../../logger';
import type { IExportEvent } from './export-event';

export type ExportFormat = 'jsonl_gzip';

export interface IBatchInfo {
  batchId: string;
  projectId: string;
  integrationId: string;
  format: ExportFormat;
  recordCount: number;
  minEventTime: string;
  maxEventTime: string;
  createdAt: string;
  partitionDate: string; // YYYY-MM-DD
  partitionHour: string; // HH
}

export interface IBatchFile {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface IBatchResult {
  info: IBatchInfo;
  files: IBatchFile[];
}

/**
 * Layout: {prefix}/project_id={projectId}/integration_id={integrationId}/dt=YYYY-MM-DD/hour=HH/batch_id={batchId}/
 */
export function generateBatchPath(
  prefix: string,
  projectId: string,
  integrationId: string,
  batchId: string,
  date: Date
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

export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'jsonl_gzip':
      return 'jsonl.gz';
  }
}

export function getContentType(format: ExportFormat): string {
  switch (format) {
    case 'jsonl_gzip':
      return 'application/gzip';
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

function createJsonlContent(events: IExportEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

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

export async function createBatch(
  logger: Logger,
  projectId: string,
  integrationId: string,
  events: IExportEvent[],
  format: ExportFormat = 'jsonl_gzip'
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
    'Batch created'
  );

  return { info, files };
}
