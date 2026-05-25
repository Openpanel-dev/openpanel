"use client";

import { AnimatePresence, motion } from "motion/react";
import type * as React from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { chartCssVars } from "../chart-context";

// Fan configuration
const FAN_RADIUS = 50;
const FAN_ANGLE = 160;

export interface ChartMarker {
  /** Date for this marker (will be matched to nearest data point) */
  date: Date;
  /** Icon to display in the marker circle */
  icon: React.ReactNode;
  /** Title shown in tooltip */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional custom content for tooltip (overrides title/description) */
  content?: React.ReactNode;
  /** Optional color override for the marker circle */
  color?: string;
  /** Click handler */
  onClick?: () => void;
  /** URL to navigate to when clicked */
  href?: string;
  /** Open href in new tab. Default: false */
  target?: "_blank" | "_self";
}

export interface MarkerGroupProps {
  /** X position in pixels */
  x: number;
  /** Y position (top of chart area) */
  y: number;
  /** Markers at this position */
  markers: ChartMarker[];
  /** Whether this marker group is currently hovered (via chart hover) */
  isActive?: boolean;
  /** Size of each marker circle */
  size?: number;
  /** Callback when marker group is hovered */
  onHover?: (markers: ChartMarker[] | null) => void;
  /** Reference to chart container for portal positioning */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Margin left offset from chart container */
  marginLeft?: number;
  /** Margin top offset from chart container */
  marginTop?: number;
  /** Delay before entrance animation starts */
  animationDelay?: number;
  /** Whether the marker should animate in */
  animate?: boolean;
  /** Height of the vertical guide line below the marker */
  lineHeight?: number;
  /** Whether to show the vertical guide line. Default: true */
  showLine?: boolean;
}

// Entrance animation variants
const markerEntranceVariants = {
  hidden: {
    scale: 0.85,
    opacity: 0,
    filter: "blur(2px)",
  },
  visible: {
    scale: 1,
    opacity: 1,
    filter: "blur(0px)",
  },
};

export function MarkerGroup({
  x,
  y,
  markers,
  isActive = false,
  size = 28,
  onHover,
  containerRef,
  marginLeft = 0,
  marginTop = 0,
  animationDelay = 0,
  animate = true,
  lineHeight = 0,
  showLine = true,
}: MarkerGroupProps) {
  const [isHovered, setIsHovered] = useState(false);
  const shouldFan = isHovered && markers.length > 1;
  const hasMultiple = markers.length > 1;

  const getCirclePosition = (index: number, total: number) => {
    const startAngle = -90 - FAN_ANGLE / 2;
    const angleStep = total > 1 ? FAN_ANGLE / (total - 1) : 0;
    const angle = startAngle + index * angleStep;
    const radians = (angle * Math.PI) / 180;

    return {
      x: Math.cos(radians) * FAN_RADIUS,
      y: Math.sin(radians) * FAN_RADIUS,
    };
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent chart from handling this event
    setIsHovered(true);
    onHover?.(markers);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent chart from handling this event
    setIsHovered(false);
    onHover?.(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent chart crosshair from moving while hovering markers
  };

  const portalX = x + marginLeft;
  const portalY = y + marginTop;

  return (
    <>
      {/* Position group - no interaction */}
      <g transform={`translate(${x}, ${y})`}>
        {/* Vertical guide line - non-interactive, rendered first (behind marker) */}
        {showLine && lineHeight > 0 && (
          <motion.line
            animate={{
              strokeOpacity: (() => {
                if (isHovered) {
                  return 1;
                }
                if (isActive) {
                  return 0;
                }
                return 0.6;
              })(),
            }}
            initial={{ strokeOpacity: 0.6 }}
            stroke={chartCssVars.markerBorder}
            strokeDasharray="4,4"
            strokeLinecap="round"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            x1={0}
            x2={0}
            y1={size / 2 + 4}
            y2={lineHeight + Math.abs(y)}
          />
        )}

        {/* Interactive marker group */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Chart marker interaction */}
        <g
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          style={{ cursor: "pointer" }}
        >
          <motion.g
            animate="visible"
            initial={animate ? "hidden" : "visible"}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
              delay: animationDelay,
            }}
            variants={markerEntranceVariants}
          >
            {/* Hit area - covers marker circle with padding for count badge above */}
            <rect
              fill="transparent"
              height={size * 1.5}
              width={size * 1.5}
              x={-size * 0.75}
              y={-size}
            />

            {/* Main marker */}
            <MarkerCircle
              color={markers[0]?.color}
              icon={markers[0]?.icon}
              size={size}
            />

            {/* Count badge */}
            <AnimatePresence>
              {hasMultiple && !shouldFan && (
                <motion.g
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  initial={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <circle
                    cx={size / 2 + 2}
                    cy={-size / 2 - 2}
                    r={9}
                    style={{ fill: chartCssVars.badgeBackground }}
                  />
                  <text
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    style={{ fill: chartCssVars.badgeForeground }}
                    textAnchor="middle"
                    x={size / 2 + 2}
                    y={-size / 2 - 2}
                  >
                    {markers.length}
                  </text>
                </motion.g>
              )}
            </AnimatePresence>
          </motion.g>
        </g>
      </g>

      {/* Portal for fanned circles */}
      {containerRef?.current &&
        createPortal(
          // biome-ignore lint/a11y/noStaticElementInteractions: Marker hover portal
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Marker hover portal
          <div
            className="absolute"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            style={{
              // Position the div so its center is at the marker position
              // The div covers the entire fan area to prevent mouseLeave when moving between markers
              left: portalX - (FAN_RADIUS + size / 2),
              top: portalY - (FAN_RADIUS + size / 2),
              width: FAN_RADIUS * 2 + size,
              height: FAN_RADIUS * 2 + size,
              zIndex: 100,
              pointerEvents: shouldFan ? "auto" : "none",
            }}
          >
            {/* Center point offset - all fanned markers are positioned relative to this */}
            <div
              className="absolute"
              style={{
                left: FAN_RADIUS + size / 2,
                top: FAN_RADIUS + size / 2,
              }}
            >
              <AnimatePresence mode="sync">
                {shouldFan &&
                  markers.map((marker, index) => {
                    const position = getCirclePosition(index, markers.length);
                    return (
                      <motion.div
                        animate={{
                          x: position.x,
                          y: position.y,
                          scale: 1,
                          opacity: 1,
                        }}
                        className="absolute"
                        exit={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                        key={`fan-${marker.title}`}
                        style={{
                          width: size,
                          height: size,
                          left: -size / 2,
                          top: -size / 2,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 22,
                          delay: index * 0.04,
                        }}
                      >
                        <MarkerCircleHTML
                          color={marker.color}
                          href={marker.href}
                          icon={marker.icon}
                          isClickable={!!(marker.onClick || marker.href)}
                          onClick={marker.onClick}
                          size={size}
                          target={marker.target}
                        />
                      </motion.div>
                    );
                  })}
              </AnimatePresence>

              <AnimatePresence>
                {shouldFan && (
                  <motion.div
                    animate={{ scale: 1, opacity: 0.5 }}
                    className="absolute"
                    exit={{ scale: 0, opacity: 0 }}
                    initial={{ scale: 0, opacity: 0 }}
                    style={{
                      width: size * 0.5,
                      height: size * 0.5,
                      left: -size * 0.25,
                      top: -size * 0.25,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <div
                      className="h-full w-full rounded-full"
                      style={{ backgroundColor: chartCssVars.markerBorder }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>,
          containerRef.current
        )}
    </>
  );
}

interface MarkerCircleProps {
  icon: React.ReactNode;
  size: number;
  color?: string;
  onClick?: () => void;
  href?: string;
  target?: "_blank" | "_self";
  isClickable?: boolean;
}

function MarkerCircle({ icon, size, color }: MarkerCircleProps) {
  return (
    <g>
      <circle cx={0} cy={2} fill="black" opacity={0.15} r={size / 2} />
      <circle
        cx={0}
        cy={0}
        fill={color || chartCssVars.markerBackground}
        r={size / 2}
        stroke={chartCssVars.markerBorder}
        strokeWidth={1.5}
      />
      <foreignObject
        height={size - 8}
        width={size - 8}
        x={-size / 2 + 4}
        y={-size / 2 + 4}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: chartCssVars.markerForeground,
            fontSize: size * 0.5,
          }}
        >
          {icon}
        </div>
      </foreignObject>
    </g>
  );
}

function MarkerCircleHTML({
  icon,
  size,
  color,
  onClick,
  href,
  target = "_self",
  isClickable = false,
}: MarkerCircleProps) {
  const hasAction = isClickable || onClick || href;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else if (href) {
      if (target === "_blank") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }
  };

  // Note: color and CSS vars must remain inline styles as they're dynamic
  return (
    <motion.div
      className={cn(
        "relative flex h-full w-full items-center justify-center rounded-full shadow-lg",
        hasAction && "cursor-pointer"
      )}
      onClick={hasAction ? handleClick : undefined}
      style={{
        backgroundColor: color || chartCssVars.markerBackground,
        border: `1.5px solid ${chartCssVars.markerBorder}`,
        fontSize: size * 0.5,
        color: chartCssVars.markerForeground,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      whileHover={
        hasAction
          ? { scale: 1.15, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }
          : undefined
      }
      whileTap={hasAction ? { scale: 0.95 } : undefined}
    >
      {icon}
    </motion.div>
  );
}

MarkerGroup.displayName = "MarkerGroup";

export default MarkerGroup;
