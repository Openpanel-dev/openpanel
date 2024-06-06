'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import useWebSocket from 'react-use-websocket';

import { getSuperJson } from '@openpanel/common';

export default function useWS<T>(path: string, onMessage: (event: T) => void) {
  const auth = useAuth();
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const [baseUrl, setBaseUrl] = useState(`${ws}${path}`);
  const [token, setToken] = useState<string | null>(null);
  const socketUrl = useMemo(
    () => (token ? `${baseUrl}?token=${token}` : baseUrl),
    [baseUrl, token]
  );

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
          onMessage(data);
        }
      } catch (error) {
        console.error('Error parsing message', error);
      }
    },
  });
}
