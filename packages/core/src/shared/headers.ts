// A lowercase header record, or a `Headers` flattened with `Object.fromEntries`,
// so no transport has to build a real `Headers` from a raw record (which throws
// on a malformed name). A transport may not deep-import a module's `src/`, so
// both auth macros convert Elysia's `Headers` here. The `Ingest` prefix stays
// because the record shape is the ingest wire contract.

export type IngestHeaders = Record<string, string | string[] | undefined>;

export function headerValue(
  headers: IngestHeaders,
  name: string
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** `Headers` -> the record shape the ingest path reads; duplicated values are joined by `Headers` itself. */
export function toIngestHeaders(headers: Headers): IngestHeaders {
  const record: IngestHeaders = {};
  for (const [name, value] of headers) {
    record[name] = value;
  }
  return record;
}
