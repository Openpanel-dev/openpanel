import { useRouteContext } from '@tanstack/react-router';
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { getCookies, setCookie } from '@tanstack/react-start/server';
import { pick } from 'ramda';
import { useMemo, useState } from 'react';
import { z } from 'zod';

const VALID_COOKIES = ['ui-theme', 'chartType', 'range'] as const;

const setCookieFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ key: z.enum(VALID_COOKIES), value: z.string() }))
  .handler(({ data: { key, value } }) => {
    setCookie(key, value);
  });

// Called in __root.tsx beforeLoad hook to get cookies from the server
// And recieved with useRouteContext in the client
export const getCookiesFn = createServerFn({ method: 'GET' }).handler(() =>
  pick(VALID_COOKIES, getCookies()),
);

export function useCookieStore<T>(
  key: (typeof VALID_COOKIES)[number],
  defaultValue: T,
) {
  const { cookies } = useRouteContext({ strict: false });
  const [value, setValue] = useState<T>((cookies?.[key] ?? defaultValue) as T);

  return useMemo(
    () =>
      [
        value,
        (value: T) => {
          console.log('setting cookie', key, value);
          setValue(value);
          setCookieFn({ data: { key, value: String(value) } });
        },
      ] as const,
    [value, key],
  );
}
