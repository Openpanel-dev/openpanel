import * as Arctic from 'arctic';
import { GitHub } from 'arctic';
import type { CoreConfig } from '../../../config';

export type { OAuth2Tokens } from 'arctic';
// Re-exported straight from source, not the `Arctic` import above — that one
// is also used below for `Arctic.Google`, so `export { Arctic }` would trip
// `noExportedImports` over a binding that genuinely has a second use.
export * as Arctic from 'arctic';

// Built per call, not at import: an arctic client is a credential holder with
// no socket, so there is nothing to keep alive and nothing to construct at
// module scope.
export function githubClient(config: CoreConfig): GitHub {
  const { clientId, clientSecret, redirectUri } = config.auth.github;
  return new GitHub(clientId, clientSecret, redirectUri);
}

export function googleClient(config: CoreConfig): Arctic.Google {
  const { clientId, clientSecret, redirectUri } = config.auth.google;
  return new Arctic.Google(clientId, clientSecret, redirectUri);
}

/** The same Google credentials, redirected at the Search Console callback. */
export function googleGscClient(config: CoreConfig): Arctic.Google {
  const { clientId, clientSecret, redirectUri } = config.auth.googleGsc;
  return new Arctic.Google(clientId, clientSecret, redirectUri);
}
