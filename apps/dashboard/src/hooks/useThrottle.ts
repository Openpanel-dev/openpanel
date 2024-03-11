import { useCallback, useEffect, useRef } from 'react';
import throttle from 'lodash.throttle';

export function useThrottle(cb: () => void, delay: number) {
  const options = { leading: true, trailing: false }; // add custom lodash options
  const cbRef = useRef(cb);
  // use mutable ref to make useCallback/throttle not depend on `cb` dep
  useEffect(() => {
    cbRef.current = cb;
  });
  return useCallback(
    throttle(() => cbRef.current(), delay, options),
    [delay]
  );
}
