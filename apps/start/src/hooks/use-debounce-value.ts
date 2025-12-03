import { useEffect, useState } from 'react';

export const useDebounceValue = <T>(value: T, delay: number): T => {
  const [state, setState] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setState(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return state;
};
