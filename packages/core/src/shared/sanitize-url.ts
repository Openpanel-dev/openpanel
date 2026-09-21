// Request URLs are logged as plain strings, so key-based redaction never
// looks inside them. Some routes take credentials in the query string (the
// MCP endpoint accepts `?token=`), which would otherwise land verbatim in
// log lines. The sensitive-key list lives here so the logger's redaction and
// the URL filter match the same names (main #484).

// Substring match (lowercased). Catches camelCase, snake_case, prefixed and
// suffixed variants in one entry — e.g. 'token' covers accessToken,
// refresh_token, jwtToken, etc.
export const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'secret',
  'authorization',
  'apikey',
  'accesskey',
  'privatekey',
  'cookie',
  'bearer',
  'credential',
  'salt',
  'signature',
  'ip',
  'email',
  'firstname',
  'lastname',
  'surname',
] as const;

export const REDACTED = '[REDACTED]';

const PLUS_AS_SPACE = /\+/g;

export function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lowered.includes(pattern));
}

/**
 * Replaces the values of sensitive query parameters, keeping the path and
 * every other parameter intact. The query is rebuilt from the raw text rather
 * than through URLSearchParams so untouched values keep their encoding.
 */
export function sanitizeUrlQuery(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }

  const query = url.slice(queryIndex + 1);
  if (query === '') {
    return url;
  }

  const sanitized = query
    .split('&')
    .map((param) => {
      const equalsIndex = param.indexOf('=');
      const rawName = equalsIndex === -1 ? param : param.slice(0, equalsIndex);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(PLUS_AS_SPACE, ' '));
      } catch {
        // Malformed percent-encoding — match on the raw name instead.
      }
      return isSensitiveKey(name) ? `${rawName}=${REDACTED}` : param;
    })
    .join('&');

  return `${url.slice(0, queryIndex)}?${sanitized}`;
}
