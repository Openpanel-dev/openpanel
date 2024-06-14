'use client';

import React, { useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';

import { ChartSwitch } from '.';
import { ChartLoading } from './ChartLoading';
import type { ChartContextType } from './ChartProvider';

export function LazyChart(props: ChartContextType) {
  const ref = useRef<HTMLDivElement>(null);
  const once = useRef(false);
  const { inViewport } = useInViewport(ref, undefined, {
    disconnectOnLeave: true,
  });

  useEffect(() => {
    if (inViewport) {
      once.current = true;
    }
  }, [inViewport]);

  return (
    <div ref={ref}>
      {once.current || inViewport ? (
        <ChartSwitch {...props} editMode={false} />
      ) : (
        <ChartLoading />
      )}
    </div>
  );
}
