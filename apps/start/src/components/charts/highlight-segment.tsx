'use client';

import { type MotionValue, motion } from 'motion/react';
import { type RefObject, useId } from 'react';

// Re-strokes the base path `d` clipped to the hover band, so the highlight
// follows whatever curve is drawn (see `highlight-segment-bounds.ts`).

export interface HighlightSegmentProps {
  /** Ref to the rendered base stroke `<path>` — its `d` is re-used verbatim. */
  pathRef: RefObject<SVGPathElement | null>;
  /** Whether to render (caller gates on showHighlight + active + loaded). */
  visible: boolean;
  stroke: string;
  strokeWidth: number;
  /** Plot height — the clip band spans it fully. */
  height: number;
  /** Spring-eased left edge of the clip band (px). */
  x: MotionValue<number>;
  /** Spring-eased width of the clip band (px). */
  width: MotionValue<number>;
}

export function HighlightSegment({
  pathRef,
  visible,
  stroke,
  strokeWidth,
  height,
  x,
  width,
}: HighlightSegmentProps) {
  const clipId = useId();
  if (!(visible && pathRef.current)) {
    return null;
  }
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <motion.rect height={height} width={width} x={x} y={0} />
        </clipPath>
      </defs>
      <motion.path
        animate={{ opacity: 1 }}
        clipPath={`url(#${clipId})`}
        d={pathRef.current.getAttribute('d') || ''}
        exit={{ opacity: 0 }}
        fill="none"
        initial={{ opacity: 0 }}
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
    </>
  );
}

HighlightSegment.displayName = 'HighlightSegment';

export default HighlightSegment;
