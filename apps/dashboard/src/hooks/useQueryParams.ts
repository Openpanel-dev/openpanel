import { useMemo } from 'react';
import { useRouter } from 'next/router';
import type { z } from 'zod';

export function useQueryParams<Z extends z.ZodTypeAny = z.ZodNever>(zod: Z) {
  const router = useRouter();
  const value = zod.safeParse(router.query);

  return useMemo(() => {
    function setQueryParams(newValue: Partial<z.infer<Z>>) {
      return router
        .replace({
          pathname: router.pathname,
          query: {
            ...router.query,
            ...newValue,
          },
        })
        .catch(() => {
          // ignore
        });
    }

    if (value.success) {
      return { ...value.data, setQueryParams } as z.infer<Z> & {
        setQueryParams: typeof setQueryParams;
      };
    }
    return { ...router.query, setQueryParams } as z.infer<Z> & {
      setQueryParams: typeof setQueryParams;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.asPath, value.success]);
}
