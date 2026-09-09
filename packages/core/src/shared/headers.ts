// A lowercase header record — Fastify's `IncomingHttpHeaders`, or a `Headers`
// flattened with `Object.fromEntries`. The ingest path reads headers exactly
// as V1 read them, so no transport has to build a `Headers` from a raw record
// (which throws on a malformed name V1 simply ignored).
//
// M15-009: moved down out of `modules/ingest/src/` (ADR-022 R22). Both auth
// macros in `http/` convert Elysia's `Headers` here before anything else runs,
// and a transport may not deep-import a module's `src/`. The names keep the
// `Ingest` prefix because the record shape is the ingest wire contract; the
// three declarations are dependency-free and belong below every layer.

export type IngestHeaders = Record<string, string | string[] | undefined>;

export function headerValue(
  headers: IngestHeaders,
  name: string
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** `Headers` -> the record shape the ingest path reads. Duplicated values are
 *  joined by `Headers` itself, exactly as a Fastify record would hold them. */
export function toIngestHeaders(headers: Headers): IngestHeaders {
  const record: IngestHeaders = {};
  for (const [name, value] of headers) {
    record[name] = value;
  }
  return record;
}
