import { useEffect } from 'react';
import debounce from 'lodash.debounce';

export function useDebounceFn<T>(fn: T, ms = 500): T {
  const debouncedFn = debounce(fn, ms);

  useEffect(() => {
    return () => {
      debouncedFn.cancel();
    };
  });

  return debouncedFn;
}
