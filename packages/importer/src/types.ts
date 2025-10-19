import type {
  IImportedEvent,
  IServiceCreateEventPayload,
  IServiceImportedEventPayload,
} from '@openpanel/db';

export interface ImportConfig {
  projectId: string;
  provider: string;
  sourceType: 'file' | 'api';
  sourceLocation: string;
}

export interface SessionInfo {
  id: string;
  lastTimestamp: number;
  lastEvent: IServiceImportedEventPayload;
}

export interface ImportProgress {
  totalEvents: number;
  processedEvents: number;
  currentBatch: number;
  totalBatches: number;
}

export interface ImportResult {
  success: boolean;
  totalEvents: number;
  processedEvents: number;
  error?: string;
}

export interface BatchResult {
  events: IServiceImportedEventPayload[];
  sessionEvents: IServiceImportedEventPayload[];
}

// Generic types for raw events from different providers
export interface BaseRawEvent {
  [key: string]: unknown;
}

// Error context for better error handling
export interface ErrorContext {
  batchNumber?: number;
  batchSize?: number;
  eventIndex?: number;
  rawEvent?: BaseRawEvent;
  provider?: string;
}

// Properties type for events - more specific than Record<string, any>
export interface EventProperties {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | Record<string, unknown>;
  __query?: Record<string, unknown>;
  __title?: string;
  __screen?: string;
  __language?: string;
}

// Import job metadata for tracking import progress
export interface ImportJobMetadata {
  importId: string;
  importStatus: 'pending' | 'processing' | 'processed' | 'failed';
  importedAt: Date;
}

// Result of import staging operations
export interface ImportStageResult {
  importId: string;
  totalEvents: number;
  insertedEvents: number;
}
