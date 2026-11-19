// Header-consistency bot signals.
//
// Real browsers send a predictable set of request headers. Automated clients
// that spoof a browser User-Agent frequently forget the low-entropy client
// hints (`sec-ch-ua`) and fetch-metadata headers (`sec-fetch-*`) that browsers
// attach automatically. A mismatch between "claims to be Chrome" and "sends
// what Chrome sends" is a strong bot signal.
//
// These checks only MARK traffic (they never block), so the cost of a false
// positive is a mislabeled event. Even so, every rule is deliberately
// UA-conditional to avoid mislabeling legitimate browsers:
//   - Firefox and Safari never send `sec-ch-ua` (it is a Blink/Chromium
//     feature), so the `sec-ch-ua` rule is gated to desktop/Android Chromium.
//   - iOS "Chrome" (CriOS) and other iOS browsers are WebKit under the hood and
//     also omit `sec-ch-ua`, so iOS is excluded from that rule too.
//
// Returned reasons are namespaced `header:<detail>` so the caller can count
// distinct signal *categories* when deciding whether to flag an event.

type HeaderValue = string | string[] | undefined;
type Headers = Record<string, HeaderValue>;

function getHeaderString(value: HeaderValue): string {
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return typeof value === 'string' ? value : '';
}

function hasHeader(value: HeaderValue): boolean {
  return getHeaderString(value).trim() !== '';
}

// A browser-shaped UA. Non-browser clients (curl, python-requests, Go-http-
// client) don't send this and are handled elsewhere (server-side auth /
// `isServer`), so header rules simply don't apply to them.
function looksLikeBrowser(ua: string): boolean {
  return ua.includes('Mozilla/');
}

// Desktop/Android Chromium (Blink), which ALWAYS emits `sec-ch-ua` — including
// on `fetch`/`sendBeacon` requests like the OpenPanel web SDK makes. iOS
// browsers (CriOS/EdgiOS/…) are WebKit and excluded, as are Firefox/Safari.
const CHROMIUM_UA_REGEX = /(?:Chrome|Chromium|Edg|OPR)\/\d/;
const APPLE_WEBKIT_UA_REGEX = /(CriOS|EdgiOS|OPiOS|FxiOS|iPhone|iPad|iPod)/;

function isBlinkChromium(ua: string): boolean {
  return CHROMIUM_UA_REGEX.test(ua) && !APPLE_WEBKIT_UA_REGEX.test(ua);
}

export function detectHeaderAnomalies(headers: Headers): string[] {
  const ua = getHeaderString(headers['user-agent']);
  if (!(ua && looksLikeBrowser(ua))) {
    return [];
  }

  const reasons: string[] = [];

  // Blink/Chromium claims to be Chrome but sent no client hints → spoofed UA.
  if (isBlinkChromium(ua) && !hasHeader(headers['sec-ch-ua'])) {
    reasons.push('header:missing_sec_ch_ua');
  }

  // Fetch-metadata headers are sent by all modern browsers on fetch requests.
  // Their total absence points to a raw HTTP client. (Kept general but weak:
  // very old Safari/iOS may omit these, which is why headers only ever count
  // as a single signal category and never flag an event on their own.)
  if (
    !(
      hasHeader(headers['sec-fetch-mode']) ||
      hasHeader(headers['sec-fetch-site'])
    )
  ) {
    reasons.push('header:missing_sec_fetch');
  }

  // Browsers send Accept-Language by default; total absence is mildly suspect.
  if (!hasHeader(headers['accept-language'])) {
    reasons.push('header:missing_accept_language');
  }

  return reasons;
}
