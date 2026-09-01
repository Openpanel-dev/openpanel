// Ported from @openpanel/validation's ISetCookie, unchanged shape. This is
// the transport-agnostic type HttpCtx.setCookie exposes to every module, so
// a module depends on this instead of Elysia's cookie type directly.

export interface CookieOptions {
  maxAge?: number;
  domain?: string;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  httpOnly?: boolean;
  signed?: boolean;
}

export type ISetCookie = (
  key: string,
  value: string,
  options: CookieOptions
) => void;

const SAME_SITE_ATTRIBUTE = {
  lax: 'Lax',
  strict: 'Strict',
  none: 'None',
} as const;

/**
 * Serializes one `Set-Cookie` header value.
 *
 * Attribute order follows the `cookie` package V1 served these through
 * (@fastify/cookie), so a header produced here is byte-comparable with V1's.
 * `signed` is deliberately not emitted: it is not a cookie attribute, it is an
 * instruction to the caller's signer.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  let header = `${name}=${encodeURIComponent(value)}`;

  if (options.maxAge !== undefined) {
    header += `; Max-Age=${Math.floor(options.maxAge)}`;
  }
  if (options.domain) {
    header += `; Domain=${options.domain}`;
  }
  if (options.path) {
    header += `; Path=${options.path}`;
  }
  if (options.httpOnly) {
    header += '; HttpOnly';
  }
  if (options.secure) {
    header += '; Secure';
  }
  if (options.sameSite) {
    header += `; SameSite=${SAME_SITE_ATTRIBUTE[options.sameSite]}`;
  }

  return header;
}
