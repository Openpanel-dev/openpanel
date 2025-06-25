import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from 'request-ip';

import type { OpenPanelOptions } from '@openpanel/sdk';
import { OpenPanel } from '@openpanel/sdk';

export * from '@openpanel/sdk';

declare global {
  namespace Express {
    export interface Request {
      op: OpenPanel;
    }
  }
}

export type OpenpanelOptions = OpenPanelOptions & {
  trackRequest?: (url: string) => boolean;
  getProfileId?: (req: Request) => string;
};

export default function createMiddleware(options: OpenpanelOptions) {
  return function middleware(req: Request, res: Response, next: NextFunction) {
    const sdk = new OpenPanel(options);
    const ip = getClientIp(req);
    if (ip) {
      sdk.api.addHeader('x-client-ip', ip);
    }
    if (req.headers['user-agent']) {
      sdk.api.addHeader('x-user-agent', req.headers['user-agent'] as string);
    }

    if (options.getProfileId) {
      const profileId = options.getProfileId(req);
      if (profileId) {
        sdk.identify({
          profileId,
        });
      }
    }

    if (options.trackRequest?.(req.url)) {
      sdk.track('request', {
        url: req.url,
        method: req.method,
        query: req.query,
      });
    }

    req.op = sdk;

    return next();
  };
}
