'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { useInViewport } from 'react-in-viewport';

import type { IChartRoot } from '.';
import { ChartRoot } from '.';
import { ChartLoading } from './ChartLoading';

export function LazyChart({
  className,
  ...props
}: IChartRoot & { className?: string }) {
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
    <div ref={ref} className={cn('w-full', className)}>
      {once.current || inViewport ? (
        <ChartRoot {...props} editMode={false} />
      ) : (
        <ChartLoading aspectRatio={props.aspectRatio} />
      )}
    </div>
  );
}
