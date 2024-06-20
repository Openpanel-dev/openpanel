'use client';

import React, { useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';

import type { IChartRoot } from '.';
import { ChartRoot } from '.';
import { ChartLoading } from './ChartLoading';

export function LazyChart(props: IChartRoot) {
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
        <ChartRoot {...props} editMode={false} />
      ) : (
        <ChartLoading />
      )}
    </div>
  );
}
