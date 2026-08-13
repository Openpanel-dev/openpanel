export type OAuthProvider = 'github' | 'google';

export interface OAuthDomainCheckInput {
  email: string;
  provider: OAuthProvider;
  hostedDomain?: string | null;
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
}

export function parseOAuthAllowedDomains(value?: string | null) {
  return Array.from(
    new Set((value ?? '').split(',').map(normalizeDomain).filter(Boolean))
  );
}

export function getOAuthAllowedDomains(provider?: OAuthProvider) {
  const domains = parseOAuthAllowedDomains(process.env.OAUTH_ALLOWED_DOMAINS);
  if (domains.length > 0) {
    return domains;
  }

  if (provider === 'google') {
    return parseOAuthAllowedDomains(
      process.env.GOOGLE_ALLOWED_DOMAINS ?? process.env.GOOGLE_ALLOWED_DOMAIN
    );
  }

  return [];
}

export function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return null;
  }
  return normalizeDomain(email.slice(atIndex + 1));
}

export function isOAuthUserAllowedByDomain(
  input: OAuthDomainCheckInput,
  allowedDomains = getOAuthAllowedDomains(input.provider)
) {
  if (allowedDomains.length === 0) {
    return true;
  }

  const emailDomain = getEmailDomain(input.email);
  if (!(emailDomain && allowedDomains.includes(emailDomain))) {
    return false;
  }

  if (input.provider === 'google') {
    const hostedDomain = input.hostedDomain
      ? normalizeDomain(input.hostedDomain)
      : null;
    return !!hostedDomain && allowedDomains.includes(hostedDomain);
  }

  return true;
}
