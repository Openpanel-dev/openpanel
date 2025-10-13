import debounce from 'debounce';
import { useEffect, useMemo, useState } from 'react';
import { useWebSocket } from 'react-use-websocket/dist/lib/use-websocket';

import { getSuperJson } from '@openpanel/json';
import { useAppContext } from './use-app-context';

type UseWSOptions = {
  debounce?: {
    delay: number;
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

  const debouncedOnMessage = useMemo(() => {
    if (options?.debounce) {
      return debounce(onMessage, options.debounce.delay, { immediate: true });
    }
    return onMessage;
  }, [options?.debounce?.delay]);

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
