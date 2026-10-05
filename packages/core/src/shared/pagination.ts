// Numeric-page offsets and opaque keyset cursors (any JSON-serializable cursor).

export const DEFAULT_PAGE_SIZE = 50;

export function offsetFromPage(
  page: number | undefined,
  pageSize: number = DEFAULT_PAGE_SIZE
): number {
  return page ? page * pageSize : 0;
}

export function encodeCursor<T>(cursor: T): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

// A cursor is user-controlled input: a malformed or tampered value must fail
// closed to null, never throw. `isValid` narrows the decoded JSON to T.
export function decodeCursor<T>(
  encoded: string,
  isValid: (value: unknown) => value is T
): T | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
