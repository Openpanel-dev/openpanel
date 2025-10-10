import * as Sentry from '@sentry/tanstackstart-react';
import {
  createMiddleware,
  registerGlobalMiddleware,
} from '@tanstack/react-start';

registerGlobalMiddleware({
  middleware: [
    createMiddleware({
      type: 'function',
    }).server(Sentry.sentryGlobalServerMiddlewareHandler()),
  ],
});
