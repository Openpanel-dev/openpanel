// The Kafka topic payload and the producer signature over it.
//
// This is a WIRE FORMAT, not an internal type: a rolling deploy overlaps a V1
// producer with a V2 consumer on the same topic, so it stays byte-compatible
// with V1's `EventsQueuePayloadIncomingEvent['payload']` (ADR-004). A leaf
// file, so both ./kafka.ts's producer and the consumer can name the payload
// without reaching into the ingest service.

import type { parseUserAgent } from '@openpanel/shared/server';
import type { GeoLocation } from '../../../clients/geo';
import type { ITrackPayload } from '../ingest.constants';

export interface IncomingEventPayload {
  // Minted by the producer (/track, /event) so a Kafka redelivery becomes an
  // identical-id row instead of a new one. Optional on the wire: a V1
  // producer omits it and a V1 consumer ignores it.
  id?: string;
  projectId: string;
  event: ITrackPayload & {
    timestamp: string | number;
    isTimestampFromThePast: boolean;
  };
  uaInfo: ReturnType<typeof parseUserAgent>;
  geo: GeoLocation;
  headers: Record<string, string | undefined>;
  deviceId: string;
  sessionId: string;
}

export type IncomingEventProducer = (
  payload: IncomingEventPayload,
  partitionKey: string
) => Promise<unknown>;
