/**
 * Ingest rejects a replay chunk whose payload is longer than this
 * (`zReplayPayload` in `packages/core/src/modules/ingest/ingest.constants.ts`),
 * so it is the real ceiling for a chunk that holds a single event.
 */
export const MAX_SINGLE_EVENT_PAYLOAD_LENGTH = 2 * 1_048_576;

/** A 16×16 grey "image removed" square, the same placeholder PostHog uses. */
export const PLACEHOLDER_IMAGE_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNOCAwSDE2TDAgMTZWOEw4IDBaIiBmaWxsPSIjMkQyRDJEIi8+CjxwYXRoIGQ9Ik0xNiA4VjE2SDhMMTYgOFoiIGZpbGw9IiMyRDJEMkQiLz4KPC9zdmc+Cg==';

// Small inline icons cost almost nothing and are what make a replay look right.
const MIN_DATA_URI_LENGTH_TO_SHRINK = 1024;

// Runs on JSON text, where a CSS `url("data:...")` reads `url(\"data:...\")`.
// The data part never consumes `"` or `\`, so every match stays inside one
// JSON string literal and the result still parses.
const DATA_URI_IN_JSON =
  /data:([\w.+-]+\/[\w.+-]+)((?:;[\w.+-]+(?:=[\w.+-]*)?)*),[^"'()\\\s]*/gi;

/**
 * Inlined images and fonts are almost always what makes a full snapshot huge,
 * and base64 barely compresses, so replacing them is the one change that
 * reliably shrinks such an event.
 */
export function shrinkDataUris(json: string): string {
  return json.replace(DATA_URI_IN_JSON, (match: string, mime: string) => {
    if (match.length < MIN_DATA_URI_LENGTH_TO_SHRINK) {
      return match;
    }
    const isImage = mime.toLowerCase().startsWith('image/');
    return isImage ? PLACEHOLDER_IMAGE_DATA_URI : '';
  });
}

/**
 * The payload to send for a chunk whose only event is over the chunk size
 * cap, or `null` when it cannot fit even with its data URIs replaced.
 * Dropping such an event is the last resort: when it is the full snapshot,
 * the player has nothing to rebuild the page from.
 */
export function fitOversizedEventPayload(json: string): string | null {
  if (json.length <= MAX_SINGLE_EVENT_PAYLOAD_LENGTH) {
    return json;
  }
  const shrunk = shrinkDataUris(json);
  return shrunk.length <= MAX_SINGLE_EVENT_PAYLOAD_LENGTH ? shrunk : null;
}
