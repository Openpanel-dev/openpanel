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
  abstract parseSource(): AsyncGenerator<TRawEvent, void, unknown>;

  /**
   * Convert provider format → IClickhouseEvent
   */
  abstract transformEvent(rawEvent: TRawEvent): IClickhouseEvent;

  /**
   * Validate raw event structure
   */
  abstract validate(rawEvent: TRawEvent): boolean;

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
}
