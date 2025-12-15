import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestURL,
  readBody,
  setResponseStatus,
} from 'h3';

const API_URL = 'https://api.openpanel.dev';

function getClientHeaders(event: any): Headers {
  const headers = new Headers();

  // Get IP from multiple possible headers (like Next.js does)
  const ip =
    getHeader(event, 'cf-connecting-ip') ||
    getHeader(event, 'x-forwarded-for')?.split(',')[0] ||
    getHeader(event, 'x-vercel-forwarded-for');

  headers.set('Content-Type', 'application/json');
  headers.set(
    'openpanel-client-id',
    getHeader(event, 'openpanel-client-id') || '',
  );

  // Construct origin: browsers send Origin header for POST requests and cross-origin requests,
  // but not for same-origin GET requests. Fallback to constructing from request URL.
  const origin =
    getHeader(event, 'origin') ||
    (() => {
      const url = getRequestURL(event);
      return `${url.protocol}//${url.host}`;
    })();
  headers.set('origin', origin);

  headers.set('User-Agent', getHeader(event, 'user-agent') || '');
  if (ip) {
    headers.set('openpanel-client-ip', ip);
  }

  return headers;
}

export default defineEventHandler(async (event) => {
  const path = event.context.params?._ || '';

  // Only handle /track routes
  if (!path.includes('track')) {
    throw createError({ statusCode: 404, message: 'Not found' });
  }

  const apiPath = `/track${path.split('track')[1] || ''}`;
  const headers = getClientHeaders(event);

  try {
    const res = await fetch(`${API_URL}${apiPath}`, {
      method: event.method,
      headers,
      body:
        event.method === 'POST'
          ? JSON.stringify(await readBody(event))
          : undefined,
    });

    setResponseStatus(event, res.status);

    if (res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }

    return res.text();
  } catch (e) {
    throw createError({
      statusCode: 500,
      message: 'Failed to proxy request',
      data: e instanceof Error ? e.message : String(e),
    });
  }
});
