// ADR-018 R2: an inbound request-id is honoured but never trusted verbatim —
// it reaches log storage and a log search. Two transports are handed one from
// outside the process — the HTTP edge (`http/hooks.ts`) and the Kafka consumer,
// which reads the id the producer stamped into the envelope — so the rule that
// decides what is safe to bind to a logger lives here rather than in either.

import { REQUEST_ID_LENGTH } from '../logger';
import { generateId } from './id';

const DISALLOWED_REQUEST_ID_CHARS = /[^A-Za-z0-9_-]/g;
const REQUEST_ID_MAX_LENGTH = 64;

export function sanitizeRequestId(
  candidate: string | null | undefined
): string | null {
  if (!candidate) {
    return null;
  }
  const cleaned = candidate
    .replace(DISALLOWED_REQUEST_ID_CHARS, '')
    .slice(0, REQUEST_ID_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** The supplied id when anything survives sanitising, a fresh one otherwise. */
export function resolveRequestId(candidate: string | null | undefined): string {
  return (
    sanitizeRequestId(candidate) ?? generateId(undefined, REQUEST_ID_LENGTH)
  );
}
