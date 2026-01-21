import { useRouteContext } from '@tanstack/react-router';
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { getCookies, setCookie } from '@tanstack/react-start/server';
import { pick } from 'ramda';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

const VALID_COOKIES = [
  'ui-theme',
  'chartType',
  'range',
  'supporter-prompt-closed',
  'feedback-prompt-seen',
] as const;
const COOKIE_EVENT_NAME = '__cookie-change';

const setCookieFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      key: z.enum(VALID_COOKIES),
      value: z.string(),
      maxAge: z.number().optional(),
    }),
  )
  .handler(({ data: { key, value, maxAge } }) => {
    if (!VALID_COOKIES.includes(key)) {
      return;
    }
    const cookieMaxAge = maxAge ?? 60 * 60 * 24 * 365 * 10;
    setCookie(key, value, {
      maxAge: cookieMaxAge,
      path: '/',
      expires: new Date(Date.now() + cookieMaxAge),
    });
  });

// Called in __root.tsx beforeLoad hook to get cookies from the server
// And received with useRouteContext in the client
export const getCookiesFn = createServerFn({ method: 'GET' }).handler(() =>
  pick(VALID_COOKIES, getCookies()),
);

export function useCookieStore<T>(
  key: (typeof VALID_COOKIES)[number],
  defaultValue: T,
  options?: { maxAge?: number },
) {
  const { cookies } = useRouteContext({ strict: false });
  const [value, setValue] = useState<T>((cookies?.[key] ?? defaultValue) as T);
  const ref = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    const handleCookieChange = (
      event: CustomEvent<{ key: string; value: T; from: string }>,
    ) => {
      if (event.detail.key === key && event.detail.from !== ref.current) {
        setValue(event.detail.value);
      }
    };

    window.addEventListener(
      COOKIE_EVENT_NAME,
      handleCookieChange as EventListener,
    );
    return () => {
      window.removeEventListener(
        COOKIE_EVENT_NAME,
        handleCookieChange as EventListener,
      );
    };
  }, [key]);

  return useMemo(
    () =>
      [
        value,
        (newValue: T) => {
          setValue(newValue);
          setCookieFn({
            data: { key, value: String(newValue), maxAge: options?.maxAge },
          });
          window.dispatchEvent(
            new CustomEvent(COOKIE_EVENT_NAME, {
              detail: { key, value: newValue, from: ref.current },
            }),
          );
        },
      ] as const,
    [value, key, options?.maxAge],
  );
}
