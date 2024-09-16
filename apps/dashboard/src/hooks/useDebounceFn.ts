import debounce from 'lodash.debounce';
import { useEffect } from 'react';

export function useDebounceFn<T>(fn: T, ms = 500): T {
  const debouncedFn = debounce(fn as any, ms);

  useEffect(() => {
    return () => {
      debouncedFn.cancel();
    };
  });

  return debouncedFn as T;
}
