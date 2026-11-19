'use client';

import { useId } from 'react';

export interface DashTailStrokeProps {
  /** SVG path `d` for the full series (single curved path). */
  pathD: string | null;
  /** X coordinate (chart inner space) where the dashed tail begins. */
  dashStartX: number;
  innerWidth: number;
  innerHeight: number;
  /** Stroke paint — solid color or gradient url. */
  stroke: string;
  strokeWidth: number;
  dashArray: string;
}

// Both halves are clipped at the same x. Splitting by path length instead
// needs the length at that x, which only an expensive search gets right on
// steep curves; an estimate drew the solid head on top of the dashed tail.
export function DashTailStroke({
  pathD,
  dashStartX,
  innerWidth,
  innerHeight,
  stroke,
  strokeWidth,
  dashArray,
}: DashTailStrokeProps) {
  const id = useId().replace(/:/g, '');
  const headClipId = `${id}-head`;
  const tailClipId = `${id}-tail`;

  if (!pathD) {
    return null;
  }

  const pad = strokeWidth * 2;
  const top = -pad;
  const height = innerHeight + pad * 2;

  return (
    <>
      <defs>
        <clipPath id={headClipId}>
          <rect height={height} width={dashStartX + pad} x={-pad} y={top} />
        </clipPath>
        <clipPath id={tailClipId}>
          <rect
            height={height}
            width={Math.max(0, innerWidth - dashStartX + pad)}
            x={dashStartX}
            y={top}
          />
        </clipPath>
      </defs>
      <path
        clipPath={`url(#${headClipId})`}
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      <path
        clipPath={`url(#${tailClipId})`}
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </>
  );
}
