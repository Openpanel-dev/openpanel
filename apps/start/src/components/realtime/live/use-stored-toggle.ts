import { useCallback, useEffect, useState } from 'react';

/**
 * A boolean remembered in localStorage. It starts at the default and reads
 * storage after mount, so the server-rendered HTML and the first client
 * render always agree.
 */
export function useStoredToggle(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      setValue(stored === 'true');
    }
  }, [key]);

  const toggle = useCallback(() => {
    setValue((previous) => {
      const next = !previous;
      window.localStorage.setItem(key, String(next));
      return next;
    });
  }, [key]);

  return [value, toggle] as const;
}
