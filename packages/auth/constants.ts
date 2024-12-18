// Sorry co.uk, but you're not a top domain
const parseCookieDomain = (url: string) => {
  const domain = new URL(url);
  return {
    domain: domain.hostname.split('.').slice(-2).join('.'),
    secure: domain.protocol === 'https:',
  };
};

const parsed = parseCookieDomain(process.env.NEXT_PUBLIC_DASHBOARD_URL ?? '');

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  domain: parsed.domain,
  secure: parsed.secure,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
} as const;
