import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from 'request-ip';

import type { OpenpanelSdkOptions } from '@openpanel/sdk';
import { OpenpanelSdk } from '@openpanel/sdk';

export * from '@openpanel/sdk';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    export interface Request {
      op: OpenpanelSdk;
    }
  }
}

export type OpenpanelOptions = OpenpanelSdkOptions & {
  trackRequest?: (url: string) => boolean;
  getProfileId?: (req: Request) => string;
};

export default function createMiddleware(options: OpenpanelOptions) {
  return function middleware(req: Request, res: Response, next: NextFunction) {
    const sdk = new OpenpanelSdk(options);
    const ip = getClientIp(req);
    if (ip) {
      sdk.api.headers['x-client-ip'] = ip;
    }

    if (options.getProfileId) {
      const profileId = options.getProfileId(req);
      if (profileId) {
        sdk.setProfileId(profileId);
      }
    }

    if (options.trackRequest?.(req.url)) {
      sdk.event('request', {
        url: req.url,
        method: req.method,
        query: req.query,
      });
    }

    req.op = sdk;

    return next();
  };
}
