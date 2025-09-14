import debounce from 'debounce';
import { useEffect } from 'react';

export function useDebounceFn<T>(fn: T, ms = 500): T {
  const debouncedFn = debounce(fn as any, ms);

  useEffect(() => {
    return () => {
      debouncedFn.clear();
    };
  });

  return debouncedFn as T;
}
