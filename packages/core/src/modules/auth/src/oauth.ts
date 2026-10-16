import * as Arctic from 'arctic';
import { GitHub } from 'arctic';
import type { CoreConfig } from '../../../config';

export type { OAuth2Tokens } from 'arctic';
// Re-exported from source: `Arctic` is also used below, so `export { Arctic }`
// would trip `noExportedImports`.
export * as Arctic from 'arctic';

// Built per call: an arctic client only holds credentials.
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
