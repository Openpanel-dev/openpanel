import {
  ATTRIBUTION_COOKIE_NAME,
  type IOrganizationAttribution,
  zOrganizationAttribution,
} from '@openpanel/core/modules/onboarding/onboarding.constants';

function readCookie(cookies: string, name: string): string | undefined {
  const prefix = `${name}=`;
  const match = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  return match?.slice(prefix.length);
}

function browserCookies(): string {
  return typeof document === 'undefined' ? '' : document.cookie;
}

/** The first touch on openpanel.dev, if the marketing site recorded one. */
export function readAttribution(
  cookies = browserCookies()
): IOrganizationAttribution | undefined {
  const raw = readCookie(cookies, ATTRIBUTION_COOKIE_NAME);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = zOrganizationAttribution.safeParse(
      JSON.parse(decodeURIComponent(raw))
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Flat `first_touch_*` properties so funnel events can break down by channel. */
export function toFirstTouchProperties(
  attribution: IOrganizationAttribution | undefined
): Record<string, string> {
  if (!attribution) {
    return {};
  }
  const properties: Record<string, string> = {};
  const keys = [
    'referrer',
    'landingPage',
    'utmSource',
    'utmMedium',
    'utmCampaign',
  ] as const;
  for (const key of keys) {
    const value = attribution[key];
    if (value) {
      properties[`first_touch_${toSnakeCase(key)}`] = value;
    }
  }
  return properties;
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
