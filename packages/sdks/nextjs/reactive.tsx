'use client';

import type { IdentifyPayload } from '@openpanel/web';
import { useEffect, useRef } from 'react';
import { useOpenPanel } from './hook';

const fastJsonEqual = (a: unknown, b: unknown) => {
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  return JSON.stringify(a) === JSON.stringify(b);
};

export function ReactiveProfile(props: IdentifyPayload) {
  const op = useOpenPanel();
  const prev = useRef<IdentifyPayload | undefined>(props);

  useEffect(() => {
    if (
      props.profileId !== prev.current?.profileId ||
      props.firstName !== prev.current?.firstName ||
      props.lastName !== prev.current?.lastName ||
      props.email !== prev.current?.email ||
      props.avatar !== prev.current?.avatar ||
      !fastJsonEqual(props.properties, prev.current?.properties)
    ) {
      op.identify(props);
      prev.current = props;
    }
  }, [props]);

  return null;
}
