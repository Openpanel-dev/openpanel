import type { IClickhouseEvent } from '../../event/event.service';
import type { BaseRawEvent } from './types';

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
    overrideFrom?: string
  ): AsyncGenerator<TRawEvent, void, unknown>;

  abstract transformEvent(rawEvent: TRawEvent): IClickhouseEvent;

  abstract validate(rawEvent: TRawEvent): boolean;

  abstract getTotalEventsCount(): Promise<number>;

  /**
   * Indicates whether session IDs should be generated in SQL after import
   * If true, the import job will generate deterministic session IDs based on
   * device_id and timestamp using SQL window functions
   * If false, assumes the provider already generates session IDs during streaming
   */
  shouldGenerateSessionIds(): boolean {
    return false;
  }

  /**
   * Utility: Split a date range into chunks to avoid timeout issues with large imports.
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
    }
  ): [string, string][] {
    const chunks: [string, string][] = [];

    const startDate = new Date(from);
    const endDate = new Date(to);
    const chunkSizeDays = options?.chunkSizeDays ?? 1;

    if (startDate.getTime() === endDate.getTime()) {
      return [[from, to]];
    }

    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const chunkStart = cursor.toISOString().split('T')[0]!;

      const chunkEndDate = new Date(cursor);
      chunkEndDate.setDate(chunkEndDate.getDate() + (chunkSizeDays - 1));

      const chunkEnd =
        chunkEndDate > endDate
          ? endDate.toISOString().split('T')[0]!
          : chunkEndDate.toISOString().split('T')[0]!;

      chunks.push([chunkStart, chunkEnd]);

      cursor.setDate(cursor.getDate() + chunkSizeDays);

      if (cursor > endDate) {
        break;
      }
    }

    return chunks;
  }
}
