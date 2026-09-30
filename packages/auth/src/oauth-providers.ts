export type OAuthLoginProvider = 'google' | 'github';

function isDisabledFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function hasCredential(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Whether the login/signup UI (and signInOAuth) should offer a social provider.
 *
 * Enabled when client id, secret, and redirect URI are set. Self-hosters leave
 * them unset to hide a provider. Use DISABLE_*_AUTH to hide login while keeping
 * the same Google credentials for Search Console.
 */
export function isOAuthLoginEnabled(provider: OAuthLoginProvider): boolean {
  if (provider === 'github') {
    if (isDisabledFlag(process.env.DISABLE_GITHUB_AUTH)) {
      return false;
    }
    return (
      hasCredential(process.env.GITHUB_CLIENT_ID) &&
      hasCredential(process.env.GITHUB_CLIENT_SECRET) &&
      hasCredential(process.env.GITHUB_REDIRECT_URI)
    );
  }

  if (isDisabledFlag(process.env.DISABLE_GOOGLE_AUTH)) {
    return false;
  }
  return (
    hasCredential(process.env.GOOGLE_CLIENT_ID) &&
    hasCredential(process.env.GOOGLE_CLIENT_SECRET) &&
    hasCredential(process.env.GOOGLE_REDIRECT_URI)
  );
}

export function getEnabledOAuthLoginProviders(): Record<
  OAuthLoginProvider,
  boolean
> {
  return {
    github: isOAuthLoginEnabled('github'),
    google: isOAuthLoginEnabled('google'),
  };
}
