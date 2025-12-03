import type { IClickhouseEvent } from '@openpanel/db';
import type { BaseRawEvent, ErrorContext, ImportJobMetadata } from './types';

export abstract class BaseImportProvider<
  TRawEvent extends BaseRawEvent = BaseRawEvent,
> {
  abstract provider: string;
  abstract version: string;

  /**
   * Stream-read and parse source (file/API) → yields raw events
   * This should be implemented as an async generator to handle large files efficiently
   */
  abstract parseSource(
    overrideFrom?: string,
  ): AsyncGenerator<TRawEvent, void, unknown>;

  /**
   * Convert provider format → IClickhouseEvent
   */
  abstract transformEvent(rawEvent: TRawEvent): IClickhouseEvent;

  /**
   * Validate raw event structure
   */
  abstract validate(rawEvent: TRawEvent): boolean;

  /**
   * Returns how many events will be imported
   */
  abstract getTotalEventsCount(): Promise<number>;

  /**
   * Optional hook: Pre-process batch
   */
  async beforeBatch?(events: TRawEvent[]): Promise<TRawEvent[]> {
    return events;
  }

  /**
   * Optional hook: Get import metadata for tracking
   */
  getImportMetadata?(): ImportJobMetadata;

  /**
   * Optional hook: Custom error handling
   */
  async onError?(error: Error, context?: ErrorContext): Promise<void> {
    // Default: re-throw
    throw error;
  }

  /**
   * Get estimated total events (optional, for progress tracking)
   */
  async getEstimatedTotal?(): Promise<number> {
    return 0;
  }

  /**
   * Indicates whether session IDs should be generated in SQL after import
   * If true, the import job will generate deterministic session IDs based on
   * device_id and timestamp using SQL window functions
   * If false, assumes the provider already generates session IDs during streaming
   */
  shouldGenerateSessionIds(): boolean {
    return false; // Default: assume provider handles it
  }

  /**
   * Utility: Split a date range into chunks to avoid timeout issues with large imports
   * Returns array of [from, to] date pairs in YYYY-MM-DD format
   *
   * @param from - Start date in YYYY-MM-DD format
   * @param to - End date in YYYY-MM-DD format
   * @param chunkSizeDays - Number of days per chunk (default: 1)
   */
  public getDateChunks(
    from: string,
    to: string,
    options?: {
      chunkSizeDays?: number;
    },
  ): Array<[string, string]> {
    const chunks: Array<[string, string]> = [];

    const startDate = new Date(from);
    const endDate = new Date(to);
    const chunkSizeDays = options?.chunkSizeDays ?? 1;

    // Handle case where from and to are the same date
    if (startDate.getTime() === endDate.getTime()) {
      return [[from, to]];
    }

    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const chunkStart = cursor.toISOString().split('T')[0]!;

      // Calculate chunk end: move forward by (chunkSizeDays - 1) to get the last day of the chunk
      const chunkEndDate = new Date(cursor);
      chunkEndDate.setDate(chunkEndDate.getDate() + (chunkSizeDays - 1));

      // Don't go past the end date
      const chunkEnd =
        chunkEndDate > endDate
          ? endDate.toISOString().split('T')[0]!
          : chunkEndDate.toISOString().split('T')[0]!;

      chunks.push([chunkStart, chunkEnd]);

      // Move cursor to the next chunk start (after the current chunk)
      cursor.setDate(cursor.getDate() + chunkSizeDays);

      if (cursor > endDate) break;
    }

    return chunks;
  }
}
