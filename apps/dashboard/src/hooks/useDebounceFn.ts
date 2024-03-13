import { useEffect } from 'react';
import debounce from 'lodash.debounce';

export function useDebounceFn<T>(fn: T, ms = 500): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
  const debouncedFn = debounce(fn as any, ms);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      debouncedFn.cancel();
    };
  });

  return debouncedFn as T;
}
