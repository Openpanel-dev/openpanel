"use client";

import type { Variants } from "motion/react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";

export interface SeriesPointMarkerStyle {
  /** Fill color for the inner circle */
  fill?: string;
  /** Outer ring stroke color. Default: same as `fill` */
  stroke?: string;
  /** Outer ring stroke width in px. Default: 2. Set to 0 to disable. */
  strokeWidth?: number;
  /** Gap between the inner fill and outer ring in px. Default: 2 */
  ringGap?: number;
  /** Optional outer outline beyond the ring. Default: 0 */
  outlineWidth?: number;
  /** Outer outline color. Default: same as `stroke` */
  outlineColor?: string;
  /** Point radius in px. Default: 5 */
  radius?: number;
  /** Dim non-active points while hovering. Default: true */
  fadeOnHover?: boolean;
  /** Opacity for non-hovered points when `fadeOnHover` is true. Default: 0.5 */
  inactiveOpacity?: number;
  /** Blur in px for non-hovered points when `fadeOnHover` is true. Default: 2 */
  inactiveBlur?: number;
  /** Initial blur in px during enter animation. Default: 2 */
  enterBlur?: number;
  /** Enlarge the active point while hovering. Default: true */
  showActiveHighlight?: boolean;
}

export interface SeriesPointMarkerProps extends SeriesPointMarkerStyle {
  dataKey: string;
  index: number;
  cx: number;
  cy: number;
  isActive: boolean;
  isHovering: boolean;
  revealDelay: number;
  revealEpoch: number;
  enterDuration: number;
  hoverEase: typeof DEFAULT_CHART_ENTER_TRANSITION.ease;
}

export function SeriesPointMarker({
  dataKey,
  index,
  cx,
  cy,
  isActive,
  isHovering,
  fadeOnHover = true,
  inactiveOpacity = 0.5,
  inactiveBlur = 2,
  enterBlur = 2,
  revealDelay,
  revealEpoch,
  enterDuration,
  fill,
  stroke,
  strokeWidth = 2,
  ringGap = 2,
  outlineWidth = 0,
  outlineColor,
  radius = 5,
  showActiveHighlight = true,
  hoverEase,
}: SeriesPointMarkerProps) {
  const resolvedStroke = stroke ?? fill ?? "currentColor";
  const resolvedOutlineColor = outlineColor ?? resolvedStroke;

  const animateState = (() => {
    if (isHovering && fadeOnHover) {
      return isActive ? "active" : "dimmed";
    }
    return "visible";
  })();

  // Memoized so motion doesn't re-evaluate variants on every chart re-render
  // (this component fans out across every data point — hot in dense charts).
  const variants = useMemo<Variants>(
    () => ({
      hidden: {
        opacity: 0,
        filter: `blur(${enterBlur}px)`,
        scale: 1,
      },
      visible: {
        opacity: 1,
        filter: "blur(0px)",
        scale: 1,
        transition: {
          delay: revealDelay,
          duration: enterDuration,
          ease: DEFAULT_CHART_ENTER_TRANSITION.ease,
        },
      },
      dimmed: {
        opacity: inactiveOpacity,
        filter: `blur(${inactiveBlur}px)`,
        scale: 1,
        transition: { duration: 0.4, ease: hoverEase },
      },
      active: {
        opacity: 1,
        filter: "blur(0px)",
        scale: showActiveHighlight ? 1.35 : 1,
        transition: { duration: 0.4, ease: hoverEase },
      },
    }),
    [
      enterBlur,
      revealDelay,
      enterDuration,
      inactiveOpacity,
      inactiveBlur,
      showActiveHighlight,
      hoverEase,
    ],
  );

  const ringOuter = strokeWidth > 0 ? radius + ringGap + strokeWidth : radius;
  const outlineRadius = outlineWidth > 0 ? ringOuter + outlineWidth / 2 : 0;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <motion.g
        animate={animateState}
        initial="hidden"
        key={`${dataKey}-${index}-${revealEpoch}`}
        variants={variants}
      >
        {outlineWidth > 0 ? (
          <circle
            cx={0}
            cy={0}
            fill="none"
            r={outlineRadius}
            stroke={resolvedOutlineColor}
            strokeWidth={outlineWidth}
          />
        ) : null}
        <circle cx={0} cy={0} fill={fill} r={radius} />
        {strokeWidth > 0 ? (
          <circle
            cx={0}
            cy={0}
            fill="none"
            r={radius + ringGap + strokeWidth / 2}
            stroke={resolvedStroke}
            strokeWidth={strokeWidth}
          />
        ) : null}
      </motion.g>
    </g>
  );
}

export function getSeriesMarkerVisualExtent(
  style: Pick<
    SeriesPointMarkerStyle,
    | "radius"
    | "strokeWidth"
    | "ringGap"
    | "outlineWidth"
    | "showActiveHighlight"
  >
): number {
  const radius = style.radius ?? 5;
  const strokeWidth = style.strokeWidth ?? 2;
  const ringGap = style.ringGap ?? 2;
  const outlineWidth = style.outlineWidth ?? 0;
  const showActiveHighlight = style.showActiveHighlight ?? true;
  const ring = strokeWidth > 0 ? ringGap + strokeWidth : 0;
  const outline = outlineWidth > 0 ? outlineWidth : 0;
  const highlightPad = showActiveHighlight ? radius * 0.35 : 0;
  return radius + ring + outline + highlightPad + 2;
}
