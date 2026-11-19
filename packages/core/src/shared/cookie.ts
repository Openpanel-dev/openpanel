// Transport-agnostic, so modules do not depend on Elysia's cookie type.

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
 * Serializes one `Set-Cookie` header value. Attribute order is fixed so output
 * stays byte-comparable across implementations. `signed` is not emitted: it is
 * an instruction to the caller's signer, not a cookie attribute.
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

/** The read half of a request's cookies; keeps Elysia's proxy behind `http/context.ts`. */
export interface CookieJar {
  get(name: string): string | undefined;
}
