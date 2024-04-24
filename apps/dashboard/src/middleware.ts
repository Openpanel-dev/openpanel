import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
// See https://clerk.com/docs/references/nextjs/auth-middleware for more information about configuring your Middleware
const isPublicRoute = createRouteMatcher([
  '/share/overview/:id',
  '/api/clerk/(.*)?',
  '/login',
  '/register',
]);

export default clerkMiddleware(
  (auth, req) => {
    if (!isPublicRoute(req)) {
      auth().protect();
    }
  },
  {
    debug: !!process.env.CLERK_DEBUG,
  }
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
