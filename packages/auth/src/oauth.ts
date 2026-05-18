import { GitHub } from 'arctic';

export type { OAuth2Tokens } from 'arctic';

import * as Arctic from 'arctic';

export { Arctic };

export const github = new GitHub(
  process.env.GITHUB_CLIENT_ID ?? '',
  process.env.GITHUB_CLIENT_SECRET ?? '',
  process.env.GITHUB_REDIRECT_URI ?? ''
);

export const google = new Arctic.Google(
  process.env.GOOGLE_CLIENT_ID ?? '',
  process.env.GOOGLE_CLIENT_SECRET ?? '',
  process.env.GOOGLE_REDIRECT_URI ?? ''
);

export const googleGsc = new Arctic.Google(
  process.env.GOOGLE_CLIENT_ID ?? '',
  process.env.GOOGLE_CLIENT_SECRET ?? '',
  process.env.GSC_GOOGLE_REDIRECT_URI ?? ''
);

// Generic OIDC provider — configured via plain endpoint URLs so it works
// with any compliant Identity Provider (Zitadel, Keycloak, Authentik,
// Okta, etc.) without per-provider library support.
//
// Required env when OIDC is enabled (i.e. OIDC_CLIENT_ID is set):
//   OIDC_CLIENT_ID
//   OIDC_CLIENT_SECRET
//   OIDC_REDIRECT_URI                — <dashboard origin>/api/oauth/oidc/callback
//   OIDC_AUTHORIZATION_ENDPOINT      — e.g. https://auth.example.com/oauth/v2/authorize
//   OIDC_TOKEN_ENDPOINT              — e.g. https://auth.example.com/oauth/v2/token
//
// Optional:
//   OIDC_DISPLAY_NAME                — label shown on the sign-in button
//                                      (defaults to "Single Sign-On")
export const oidc = new Arctic.OAuth2Client(
  process.env.OIDC_CLIENT_ID ?? '',
  process.env.OIDC_CLIENT_SECRET ?? '',
  process.env.OIDC_REDIRECT_URI ?? ''
);

export const OIDC_AUTHORIZATION_ENDPOINT =
  process.env.OIDC_AUTHORIZATION_ENDPOINT ?? '';
export const OIDC_TOKEN_ENDPOINT = process.env.OIDC_TOKEN_ENDPOINT ?? '';
export const OIDC_DISPLAY_NAME =
  process.env.OIDC_DISPLAY_NAME ?? 'Single Sign-On';

export const isOidcEnabled = (): boolean =>
  !!(
    process.env.OIDC_CLIENT_ID &&
    process.env.OIDC_CLIENT_SECRET &&
    process.env.OIDC_REDIRECT_URI &&
    process.env.OIDC_AUTHORIZATION_ENDPOINT &&
    process.env.OIDC_TOKEN_ENDPOINT
  );
