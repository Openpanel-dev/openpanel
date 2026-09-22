import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * HTTP Basic auth for operator-only routes such as Bull Board. Browsers
 * prompt for the credentials, so no extra UI is needed.
 */
export function basicAuth(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const givenUser = decoded.slice(0, separator);
      const givenPassword = decoded.slice(separator + 1);
      if (
        separator !== -1 &&
        safeEqual(givenUser, username) &&
        safeEqual(givenPassword, password)
      ) {
        next();
        return;
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="OpenPanel worker"');
    res.status(401).send('Unauthorized');
  };
}
