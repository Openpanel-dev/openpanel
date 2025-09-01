import { validateSessionToken } from '@openpanel/auth';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';

const getSessionFromRequest = async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const parsedCookie = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.split('=');
      if (key || value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  const sessionToken = parsedCookie.session;

  if (!sessionToken) {
    return null;
  }

  return validateSessionToken(sessionToken);
};

export const getAuthSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const req = getWebRequest()!;
    const session = await getSessionFromRequest(req);
    return session;
  },
);

export const getAuthSessionQueryOptions = queryOptions({
  queryKey: ['auth', 'session'],
  queryFn: getAuthSession,
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 10,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
});
