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
