'use client';

import debounce from 'lodash.debounce';
import { use, useEffect, useMemo, useState } from 'react';
import useWebSocket from 'react-use-websocket';

import { getSuperJson } from '@openpanel/json';

type UseWSOptions = {
  debounce?: {
    delay: number;
  } & Parameters<typeof debounce>[2];
};

export default function useWS<T>(
  path: string,
  onMessage: (event: T) => void,
  options?: UseWSOptions,
) {
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const [baseUrl, setBaseUrl] = useState(`${ws}${path}`);

  const debouncedOnMessage = useMemo(() => {
    if (options?.debounce) {
      return debounce(onMessage, options.debounce.delay, options.debounce);
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
