/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */

import type { ReactNode } from 'react';

export interface PatternProps {
  /** Unique id of the pattern element. */
  id: string;
  /** Width of the pattern. */
  width: number;
  /** Height of the pattern. */
  height: number;
  /** Children of pattern element to render. */
  children: ReactNode;
}

export function Pattern({ id, width, height, children }: PatternProps) {
  return (
    <defs>
      <pattern
        height={height}
        id={id}
        patternUnits="userSpaceOnUse"
        width={width}
      >
        {children}
      </pattern>
    </defs>
  );
}
