import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
// See https://clerk.com/docs/references/nextjs/auth-middleware for more information about configuring your Middleware
const isPublicRoute = createRouteMatcher([
  '/share/overview/:id',
  '/api/clerk/(.*)?',
  '/login(.*)?',
  '/register(.*)?',
  '/sso-callback(.*)?',
]);

export default clerkMiddleware(
  (auth, req) => {
    if (process.env.MAINTENANCE_MODE && !req.url.includes('/maintenance')) {
      return NextResponse.redirect(new URL('/maintenance', req.url), 307);
    }
    if (!isPublicRoute(req)) {
      auth().protect();
    }
  },
  {
    debug: !!process.env.CLERK_DEBUG,
  },
);

export const config = {
  matcher: [
    '/((?!.+\\.[\\w]+$|_next).*)',
    '/',
    '/(api)(.*)',
    '/(api|trpc)(.*)',
    '/api/trpc(.*)',
  ],
};
