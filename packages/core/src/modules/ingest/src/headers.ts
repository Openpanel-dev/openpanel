// A lowercase header record — Fastify's `IncomingHttpHeaders`, or a `Headers`
// flattened with `Object.fromEntries`. The ingest path reads headers exactly
// as V1 read them, so no transport has to build a `Headers` from a raw record
// (which throws on a malformed name V1 simply ignored).

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
