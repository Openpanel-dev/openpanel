import { GitHub } from 'arctic';

export type { OAuth2Tokens } from 'arctic';
import * as Arctic from 'arctic';

export { Arctic };

export const github = new GitHub(
  process.env.GITHUB_CLIENT_ID ?? '',
  process.env.GITHUB_CLIENT_SECRET ?? '',
  process.env.GITHUB_REDIRECT_URI ?? '',
);

export const google = new Arctic.Google(
  process.env.GOOGLE_CLIENT_ID ?? '',
  process.env.GOOGLE_CLIENT_SECRET ?? '',
  process.env.GOOGLE_REDIRECT_URI ?? '',
);
