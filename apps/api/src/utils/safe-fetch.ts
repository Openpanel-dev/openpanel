/**
 * The SSRF guard lives in `@openpanel/core` so that every
 * outbound-fetch site in the monorepo can reach it - the api controllers, the
 * worker's webhook delivery and the importer's remote-file reader alike. It
 * used to live here, which is why the importer never called it
 * (GHSA-cj2r-3x54-88h7).
 *
 * This module stays as a re-export so the existing `@/utils/safe-fetch` imports
 * keep working.
 */
export {
  assertPublicHostname,
  assertPublicUrl,
  BlockedUrlError,
  createPinnedAgent,
  isBlockedIp,
  type SafeFetchOptions,
  type SafeFetchResult,
  type SafeFetchStreamResult,
  safeFetch,
  safeFetchStream,
} from '@openpanel/core';
