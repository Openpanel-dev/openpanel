import * as Arctic from 'arctic';
import { GitHub } from 'arctic';

export type { OAuth2Tokens } from 'arctic';
// Re-exported straight from source, not the `Arctic` import above — that one
// is also used below for `Arctic.Google`, so `export { Arctic }` would trip
// `noExportedImports` over a binding that genuinely has a second use.
export * as Arctic from 'arctic';

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
