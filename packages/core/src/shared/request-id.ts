// An inbound request-id is honoured but never trusted verbatim: it reaches log
// storage and log search. Both the HTTP edge and the Kafka consumer receive one
// from outside the process, so the rule for what is safe to bind to a logger
// lives here.

import { generateId } from '@openpanel/shared';
import { REQUEST_ID_LENGTH } from '../logger';

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
