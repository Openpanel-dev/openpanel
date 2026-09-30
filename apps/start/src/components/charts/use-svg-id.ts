"use client";

import { useId } from "react";
import { sanitizeSvgId } from "./sanitize-svg-id";

/**
 * Stable, Safari-safe id for SVG paint servers (`url(#id)`, mask, clipPath).
 */
export function useSvgId(prefix?: string): string {
  const raw = sanitizeSvgId(useId());
  return prefix ? `${sanitizeSvgId(prefix)}-${raw}` : raw;
}
