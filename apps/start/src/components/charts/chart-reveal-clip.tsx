"use client";

import type { Transition } from "motion/react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { clipRevealTransition } from "./animation";

export interface ChartRevealClipProps {
  clipPathId: string;
  height: number;
  targetWidth: number;
  enterTransition?: Transition;
  /** Bumps when motion settings change to replay the reveal. */
  revealEpoch: number;
  /** Extra inset around the clip rect so edge glyphs are not cut off. */
  padding?: number;
}

function isSafariSvgClipBug(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  // Motion animates SVG `width` via CSS on Safari, which clipPath ignores —
  // charts stay clipped to 0. Skip the motion path there.
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/**
 * Left-to-right clip reveal for cartesian series.
 * Grows clip rect width from 0 → full (true LTR; scaleX is avoided — it reveals from center).
 */
export function ChartRevealClip({
  clipPathId,
  height,
  targetWidth,
  enterTransition,
  revealEpoch,
  padding = 0,
}: ChartRevealClipProps) {
  const transition = clipRevealTransition(enterTransition);
  const paddedWidth = Math.max(0, targetWidth + padding * 2);
  const paddedHeight = height + padding * 2;
  const [safariSafe, setSafariSafe] = useState(false);

  useEffect(() => {
    setSafariSafe(isSafariSvgClipBug());
  }, []);

  if (safariSafe) {
    return (
      <clipPath id={clipPathId}>
        <rect
          height={paddedHeight}
          width={paddedWidth}
          x={-padding}
          y={-padding}
        />
      </clipPath>
    );
  }

  return (
    <clipPath id={clipPathId}>
      <motion.rect
        animate={{ width: paddedWidth }}
        height={paddedHeight}
        initial={{ width: 0 }}
        key={`reveal-${revealEpoch}`}
        transition={transition}
        width={paddedWidth}
        x={-padding}
        y={-padding}
      />
    </clipPath>
  );
}
