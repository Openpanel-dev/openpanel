// The favicon proxy never connects to what the caller sends: it only needs
// a hostname to ask the icon services about, so the input is reduced to that
// and everything else (path, port, credentials, scheme) is dropped.

const MAX_HOSTNAME_LENGTH = 253;
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HOSTNAME_PATTERN = new RegExp(
  `^${HOSTNAME_LABEL}(?:\\.${HOSTNAME_LABEL})+$`
);
const NUMERIC_LAST_LABEL = /\.\d+$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The lower-cased DNS name in a URL or bare host, or `null`. IP addresses
 * and single-label names such as `localhost` have no public favicon. */
export function hostnameFromInput(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const withScheme = HAS_SCHEME.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const isDnsName =
    hostname.length <= MAX_HOSTNAME_LENGTH &&
    HOSTNAME_PATTERN.test(hostname) &&
    !NUMERIC_LAST_LABEL.test(hostname);
  return isDnsName ? hostname : null;
}
