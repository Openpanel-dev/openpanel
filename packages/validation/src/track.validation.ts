// Moved into @openpanel/core's ingest module (M8-002, ADR-008's module map:
// ingest owns "C" — track.validation + event-blocklist + RESERVED_EVENT_NAMES
// are one file there). Re-exported here for existing @openpanel/validation
// importers (apps/api's ingest routes and hooks, the SDKs' shared types,
// apps/start) — same shape as ./import.validation.ts since M5-004. The SDK
// deep-import retarget to the constants subpath is P11.
export * from '@openpanel/core/modules/ingest/ingest.constants';
