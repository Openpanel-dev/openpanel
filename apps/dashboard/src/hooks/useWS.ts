'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import debounce from 'lodash.debounce';
import useWebSocket from 'react-use-websocket';

import { getSuperJson } from '@openpanel/common';

type UseWSOptions = {
  debounce?: {
    delay: number;
  } & Parameters<typeof debounce>[2];
};

export default function useWS<T>(
  path: string,
  onMessage: (event: T) => void,
  options?: UseWSOptions
) {
  const auth = useAuth();
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const [baseUrl, setBaseUrl] = useState(`${ws}${path}`);
  const [token, setToken] = useState<string | null>(null);
  const socketUrl = useMemo(() => {
    const parseUrl = new URL(baseUrl);
    if (token) {
      parseUrl.searchParams.set('token', token);
    }
    return parseUrl.toString();
  }, [baseUrl, token]);

  const debouncedOnMessage = useMemo(() => {
    if (options?.debounce) {
      return debounce(onMessage, options.debounce.delay, options.debounce);
    }
    return onMessage;
  }, [options?.debounce?.delay]);

  useEffect(() => {
    if (auth.isSignedIn) {
      auth.getToken().then(setToken);
    }
  }, [auth]);

  useEffect(() => {
    if (baseUrl === `${ws}${path}`) return;
    setBaseUrl(`${ws}${path}`);
  }, [path, baseUrl, ws]);

  useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    onMessage(event) {
      try {
        const data = getSuperJson<T>(event.data);
        if (data) {
          debouncedOnMessage(data);
        }
      } catch (error) {
        console.error('Error parsing message', error);
      }
    },
  });
}
