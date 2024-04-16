'use client';

import { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';

import { getSuperJson } from '@openpanel/common';

export default function useWS<T>(path: string, onMessage: (event: T) => void) {
  const ws = String(process.env.NEXT_PUBLIC_API_URL)
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws');
  const [socketUrl, setSocketUrl] = useState(`${ws}${path}`);

  useEffect(() => {
    if (socketUrl === `${ws}${path}`) return;
    setSocketUrl(`${ws}${path}`);
  }, [path, socketUrl, ws]);

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
