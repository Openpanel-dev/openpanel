// The Kafka topic payload and the producer signature over it.
//
// This is a WIRE FORMAT, not an internal type: it must stay byte-compatible
// across a rolling deploy where two producer/consumer versions overlap on the
// same topic. A leaf file, so both./kafka.ts's producer and the consumer can
// name the payload without reaching into the ingest service.

import type { parseUserAgent } from '@openpanel/shared/server';
import type { GeoLocation } from '../../../clients/geo';
import type { ITrackPayload } from '../ingest.constants';

export interface IncomingEventPayload {
  // Minted by the producer (/track, /event) so a Kafka redelivery becomes an
  // identical-id row instead of a new one. Optional on the wire, for
  // compatibility with producers and consumers from before this field
  // existed.
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
