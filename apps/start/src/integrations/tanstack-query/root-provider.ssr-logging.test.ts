import { TRPCClientError } from '@trpc/client';
import superjson from 'superjson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTRPCClientWithHeaders,
  getContext,
  getIsomorphicHeaders,
} from './root-provider';

const runtime = vi.hoisted(() => ({
  ssr: true,
  headers: new Headers(),
}));

vi.mock('@tanstack/react-start', () => ({
  createIsomorphicFn: () => ({
    server: (onServer: () => unknown) => ({
      client: (onClient: () => unknown) => () =>
        runtime.ssr ? onServer() : onClient(),
    }),
  }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => runtime.headers,
}));

const PUBLIC_API = 'https://public-api.invalid';
const INTERNAL_API = 'http://internal-api.invalid';
const COOKIE = 'session=synthetic-f07-cookie';
const SESSION = { session: null, user: null, userId: null };
const fetchMock = vi.fn<typeof fetch>();
const debugLog = vi.fn();
const queryClients: { clear: () => void }[] = [];

function successResponse() {
  return Response.json({ result: { data: superjson.serialize(SESSION) } });
}

function errorResponse(status = 403) {
  return Response.json(
    {
      error: superjson.serialize({
        message: 'Synthetic API failure',
        code: status === 401 ? -32_001 : -32_003,
        data: {
          code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          httpStatus: status,
          path: 'auth.session',
        },
      }),
    },
    {
      status,
      statusText: status === 401 ? 'Unauthorized' : 'Forbidden',
      headers: { 'content-type': 'application/json' },
    }
  );
}

function requestOptions() {
  const options = fetchMock.mock.calls[0]?.[1];
  if (!options) {
    throw new Error('Expected an intercepted tRPC fetch');
  }
  return options;
}

function browser(pathname = '/dashboard') {
  runtime.ssr = false;
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname, assign } });
  return assign;
}

function queryThroughContext() {
  const context = getContext(PUBLIC_API);
  queryClients.push(context.queryClient);
  return context.queryClient.fetchQuery(
    context.trpc.auth.session.queryOptions()
  );
}

beforeEach(() => {
  runtime.ssr = true;
  runtime.headers = new Headers({
    Cookie: COOKIE,
    Connection: 'upgrade',
    Authorization: 'synthetic-inbound-authorization',
  });
  vi.stubEnv('API_URL_SSR', INTERNAL_API);
  vi.stubGlobal('window', undefined);
  fetchMock.mockReset().mockImplementation(async () => successResponse());
  debugLog.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(debugLog);
});

afterEach(() => {
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SSR tRPC request and log protection', () => {
  it('uses the internal address and original cookie through the actual client', async () => {
    const controller = new AbortController();
    const client = createTRPCClientWithHeaders(PUBLIC_API);
    const session = await client.auth.session.query(undefined, {
      signal: controller.signal,
    });

    expect(session).toEqual(SESSION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `${INTERNAL_API}/trpc/auth.session`
    );
    expect(requestOptions()).toMatchObject({
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      signal: controller.signal,
    });
    const headers = new Headers(requestOptions().headers);
    expect(headers.get('cookie')).toBe(COOKIE);
    expect(headers.has('connection')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  for (const override of [undefined, '']) {
    it(`uses the public address when the SSR override is ${String(override)}`, async () => {
      vi.stubEnv('API_URL_SSR', override);
      await createTRPCClientWithHeaders(PUBLIC_API).auth.session.query();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        `${PUBLIC_API}/trpc/auth.session`
      );
      expect(console.error).not.toHaveBeenCalled();
    });
  }

  it('does not invent a request cookie when the inbound cookie is missing', async () => {
    runtime.headers = new Headers({ Connection: 'upgrade' });
    expect(getIsomorphicHeaders()).toEqual({});
    await createTRPCClientWithHeaders(PUBLIC_API).auth.session.query();
    expect(new Headers(requestOptions().headers).has('cookie')).toBe(false);
  });

  it('masks the HTTP error log without changing the request or consuming its response', async () => {
    const response = errorResponse();
    const clone = vi.spyOn(response, 'clone');
    const json = vi.spyOn(response, 'json');
    const expectedBody = await response.clone().text();
    clone.mockClear();
    fetchMock.mockResolvedValue(response);

    await expect(
      createTRPCClientWithHeaders(PUBLIC_API).auth.session.query()
    ).rejects.toMatchObject({
      message: 'Synthetic API failure',
      data: { httpStatus: 403 },
    });

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      '[tRPC SSR Error]',
      expect.objectContaining({
        url: expect.stringContaining(`${INTERNAL_API}/trpc/auth.session`),
        status: 403,
        statusText: 'Forbidden',
        body: expectedBody,
        options: expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ cookie: 'redacted' }),
        }),
      })
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      COOKIE
    );
    expect(new Headers(requestOptions().headers).get('cookie')).toBe(COOKIE);
    expect(clone).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(1);
    expect(response.bodyUsed).toBe(true);
  });

  it('masks fetch failure logs and preserves the original error as the client cause', async () => {
    const failure = new Error('Synthetic fetch failure');
    fetchMock.mockRejectedValue(failure);
    const result = await createTRPCClientWithHeaders(PUBLIC_API)
      .auth.session.query()
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(TRPCClientError);
    expect(result).toMatchObject({ cause: failure });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      '[tRPC SSR Error]',
      expect.objectContaining({
        url: expect.stringContaining(`${INTERNAL_API}/trpc/auth.session`),
        error: failure.message,
        stack: failure.stack,
        options: expect.objectContaining({
          headers: expect.objectContaining({ cookie: 'redacted' }),
        }),
      })
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      COOKIE
    );
    expect(new Headers(requestOptions().headers).get('cookie')).toBe(COOKIE);
  });
});

describe('browser and query-context regression', () => {
  it('does not print environment or baseUrl diagnostics in either environment', async () => {
    await createTRPCClientWithHeaders(PUBLIC_API).auth.session.query();
    browser();
    await createTRPCClientWithHeaders(PUBLIC_API).auth.session.query();
    expect(debugLog).not.toHaveBeenCalled();
  });

  it('uses the public address without forwarding server cookies', async () => {
    browser();
    expect(getIsomorphicHeaders()).toEqual({});
    await createTRPCClientWithHeaders(PUBLIC_API).auth.session.query();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `${PUBLIC_API}/trpc/auth.session`
    );
    expect(new Headers(requestOptions().headers).has('cookie')).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('does not write an SSR log for a browser HTTP failure', async () => {
    browser();
    fetchMock.mockResolvedValue(errorResponse());
    await expect(
      createTRPCClientWithHeaders(PUBLIC_API).auth.session.query()
    ).rejects.toBeInstanceOf(TRPCClientError);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('does not write an SSR log for a browser fetch failure', async () => {
    browser();
    fetchMock.mockRejectedValue(new Error('Synthetic browser fetch failure'));
    await expect(
      createTRPCClientWithHeaders(PUBLIC_API).auth.session.query()
    ).rejects.toBeInstanceOf(TRPCClientError);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('passes a successful session through the actual query context', async () => {
    expect(await queryThroughContext()).toEqual(SESSION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps the browser 401 redirect without retrying the request', async () => {
    const assign = browser();
    fetchMock.mockResolvedValue(errorResponse(401));
    await expect(queryThroughContext()).rejects.toBeInstanceOf(TRPCClientError);
    expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps a browser 403 on the current page without retrying the request', async () => {
    const assign = browser();
    fetchMock.mockResolvedValue(errorResponse());
    await expect(queryThroughContext()).rejects.toBeInstanceOf(TRPCClientError);
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not redirect again when a browser 401 occurs on the login page', async () => {
    const assign = browser('/login');
    fetchMock.mockResolvedValue(errorResponse(401));
    await expect(queryThroughContext()).rejects.toBeInstanceOf(TRPCClientError);
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
