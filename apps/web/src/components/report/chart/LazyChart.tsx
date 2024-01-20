'use client';

import React, { useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';

import type { ReportChartProps } from '.';
import { Chart } from '.';
import type { ChartContextType } from './ChartProvider';

export function LazyChart(props: ReportChartProps & ChartContextType) {
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
        <Chart {...props} editMode={false} />
      ) : (
        <div className="h-64 w-full bg-gray-200 animate-pulse rounded" />
      )}
    </div>
  );
}
