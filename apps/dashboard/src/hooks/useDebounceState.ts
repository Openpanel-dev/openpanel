import debounce from 'lodash.debounce';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface DebouncedState<T> {
  value: T;
  debounced: T;
  set: React.Dispatch<React.SetStateAction<T>>;
}

export function useDebounceState<T>(
  initialValue: T,
  delay = 500,
  options?: Parameters<typeof debounce>[2],
): DebouncedState<T> {
  const [value, setValue] = useState<T>(initialValue);
  const [debouncedValue, _setDebouncedValue] = useState<T>(initialValue);
  const setDebouncedValue = useMemo(
    () => debounce(_setDebouncedValue, delay, options),
    [],
  );
  useEffect(() => {
    setDebouncedValue(value);
  }, [value]);

  return {
    value,
    debounced: debouncedValue,
    set: setValue,
  };
}
