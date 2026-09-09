// The Node-only entrypoint of @openpanel/shared (ADR-022 R21):
// `@openpanel/shared/server`. Everything behind it may use `node:*`.
//
// A web app may not import it — `no-web-to-server` in .dependency-cruiser.cjs
// forbids apps/start, apps/public and packages/sdks/* from reaching this path.
export {
  createHash,
  generateSalt,
  hashPassword,
  verifyPassword,
} from './crypto';
export {
  decrypt,
  decryptCredential,
  type EncryptionKey,
  encrypt,
  encryptCredential,
  isEncrypted,
} from './encryption';
export {
  getDevice,
  parseUserAgent,
  type UserAgentInfo,
  type UserAgentResult,
} from './parser-user-agent';
export {
  assertPublicHostname,
  assertPublicUrl,
  BlockedUrlError,
  createPinnedAgent,
  createPinnedLookup,
  isBlockedIp,
  type SafeFetchOptions,
  type SafeFetchResult,
  type SafeFetchStreamResult,
  safeFetch,
  safeFetchStream,
} from './safe-fetch';
export { assertSafeUrl } from './ssrf';
