// This is the transport-agnostic type HttpCtx.setCookie exposes to every
// module, so a module depends on this instead of Elysia's cookie type directly.

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
 * Attribute order is fixed and deliberate, so a header produced here stays
 * byte-comparable across implementations. `signed` is deliberately not
 * emitted: it is not a cookie attribute, it is an instruction to the
 * caller's signer.
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

/**
 * The read half of a request's cookies, transport-agnostic.
 *
 * `HttpCtx.cookies` is this and not Elysia's cookie record: a module reads a
 * cookie by name and nothing else, so the framework's proxy stays behind
 * `http/context.ts` and a `Ctx` never carries an Elysia type.
 */
export interface CookieJar {
  get(name: string): string | undefined;
}
