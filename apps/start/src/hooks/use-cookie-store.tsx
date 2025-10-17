import { useRouteContext } from '@tanstack/react-router';
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { getCookies, setCookie } from '@tanstack/react-start/server';
import { useMemo, useState } from 'react';
import { z } from 'zod';

const setCookieFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ key: z.string(), value: z.string() }))
  .handler(({ data: { key, value } }) => {
    setCookie(key, value);
  });

// Called in __root.tsx beforeLoad hook to get cookies from the server
// And recieved with useRouteContext in the client
export const getCookiesFn = createServerFn({ method: 'GET' }).handler(() =>
  getCookies(),
);

export function useCookieStore<T>(key: string, defaultValue: T) {
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
