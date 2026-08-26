import debounce from 'lodash.debounce';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from 'react-use-websocket/dist/lib/use-websocket';

import { getSuperJson } from '@openpanel/json';
import { useAppContext } from './use-app-context';

type UseWSOptions = {
  debounce?: {
    delay: number;
    maxWait?: number;
  };
};

export default function useWS<T>(
  path: string,
  onMessage: (event: T) => void,
  options?: UseWSOptions,
) {
  const context = useAppContext();
  const ws = context.apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');
  const [baseUrl, setBaseUrl] = useState(`${ws}${path}`);

  // Always call the latest onMessage. The memoized (debounced) wrapper below
  // otherwise captures the first render's callback — if the path changes
  // without unmounting (e.g. switching projects), the socket would reconnect
  // but keep invoking a handler closed over the old path's state.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  const debouncedOnMessage = useMemo(() => {
    const invokeLatest = (event: T) => onMessageRef.current(event);
    if (options?.debounce) {
      return debounce(invokeLatest, options.debounce.delay, options.debounce);
    }
    return invokeLatest;
  }, [options?.debounce?.delay, options?.debounce?.maxWait]);

  useEffect(() => {
    if (baseUrl === `${ws}${path}`) return;
    setBaseUrl(`${ws}${path}`);
  }, [path, baseUrl, ws]);

  useWebSocket(baseUrl, {
    shouldReconnect: () => true,
    onMessage(event) {
      try {
        const data = getSuperJson<T>(event.data);
        if (data !== null && data !== undefined) {
          debouncedOnMessage(data);
        }
      } catch (error) {
        console.error('Error parsing message', error);
      }
    },
  });
}
