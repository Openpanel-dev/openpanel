import { COOKIE_MAX_AGE, COOKIE_OPTIONS } from '@openpanel/auth/constants';
import { type NextRequest, NextResponse } from 'next/server';

function createRouteMatcher(patterns: string[]) {
  // Convert route patterns to regex patterns
  const regexPatterns = patterns.map((pattern) => {
    // Replace route parameters (:id) with regex capture groups
    const regexPattern = pattern
      .replace(/\//g, '\\/') // Escape forward slashes
      .replace(/:\w+/g, '([^/]+)') // Convert :param to capture groups
      .replace(/\(\.\*\)\?/g, '(?:.*)?'); // Handle optional wildcards

    return new RegExp(`^${regexPattern}$`);
  });

  // Return a matcher function
  return (req: { url: string }) => {
    const pathname = new URL(req.url).pathname;
    return regexPatterns.some((regex) => regex.test(pathname));
  };
}

// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
const isPublicRoute = createRouteMatcher([
  '/share/overview/:id',
  '/login(.*)?',
  '/reset-password(.*)?',
  '/sso-callback(.*)?',
  '/onboarding',
  '/maintenance',
  '/api/headers',
]);

export default (request: NextRequest) => {
  // Check for maintenance mode
  if (
    process.env.MAINTENANCE === 'true' &&
    !request.nextUrl.pathname.startsWith('/maintenance')
  ) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  if (request.method === 'GET') {
    const response = NextResponse.next();
    const token = request.cookies.get('session')?.value ?? null;

    if (process.env.DEMO_USER_ID) {
      return response;
    }

    if (!isPublicRoute(request) && token === null) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (token !== null) {
      // Only extend cookie expiration on GET requests since we can be sure
      // a new session wasn't set when handling the request.
      response.cookies.set('session', token, {
        maxAge: COOKIE_MAX_AGE,
        ...COOKIE_OPTIONS,
      });
    }
    return response;
  }

  const originHeader = request.headers.get('Origin');
  // NOTE: You may need to use `X-Forwarded-Host` instead
  const hostHeader = request.headers.get('Host');
  if (originHeader === null || hostHeader === null) {
    return new NextResponse(null, {
      status: 403,
    });
  }
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return new NextResponse(null, {
      status: 403,
    });
  }
  if (origin.host !== hostHeader) {
    return new NextResponse(null, {
      status: 403,
    });
  }

  return NextResponse.next();
};

export const config = {
  matcher: [
    '/((?!.+\\.[\\w]+$|_next).*)',
    '/',
    '/(api)(.*)',
    '/(api|trpc)(.*)',
    '/api/trpc(.*)',
  ],
};
