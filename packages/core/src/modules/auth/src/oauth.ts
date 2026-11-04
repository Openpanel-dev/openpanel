import * as Arctic from 'arctic';
import type { CoreConfig, OAuthClientConfig } from '../../../config';

export type { OAuth2Tokens } from 'arctic';
// Re-exported from source: `Arctic` is also used below, so `export { Arctic }`
// would trip `noExportedImports`.
export * as Arctic from 'arctic';

/** The same Google credentials, redirected at the Search Console callback. */
export function googleGscClient(config: CoreConfig): Arctic.Google {
  const { clientId, clientSecret, redirectUri } = config.auth.googleGsc;
  return new Arctic.Google(clientId, clientSecret, redirectUri);
}

/** A client missing any credential cannot complete a sign-in, so it counts as absent. */
export function isOAuthClientConfigured(client: OAuthClientConfig): boolean {
  return Boolean(client.clientId && client.clientSecret && client.redirectUri);
}
