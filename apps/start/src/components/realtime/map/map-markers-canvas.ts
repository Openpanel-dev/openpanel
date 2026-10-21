import type { ZoomTransform } from 'd3-zoom';
import {
  MARKER_ACTIVE_RING_GAP,
  MARKER_PULSE_ALPHA,
  MARKER_PULSE_DURATION_MS,
  MARKER_PULSE_SPREAD,
  MARKER_STROKE_WIDTH,
  MARKER_VIEWPORT_MARGIN,
} from './map-constants';

export interface MarkerStyle {
  fill: string;
  stroke: string;
  ring: string;
}

export interface DrawnMarker {
  id: string;
  /** World coordinates at zoom 1. */
  x: number;
  y: number;
  radius: number;
  pulses: boolean;
}

const FULL_TURN = 2 * Math.PI;
const HASH_MODULUS = 1_000_003;
const PHASE_STEPS = 1000;

/**
 * Draws every visible dot in one fill and one stroke. Hundreds of dots cost
 * about a millisecond this way, where hundreds of DOM nodes would each need
 * style and paint work on every frame of a zoom.
 */
export function drawMarkers({
  context,
  markers,
  transform,
  viewport,
  copyOffsets,
  activeId,
  style,
  now,
}: {
  context: CanvasRenderingContext2D;
  markers: DrawnMarker[];
  transform: ZoomTransform;
  viewport: { width: number; height: number; pixelRatio: number };
  copyOffsets: number[];
  activeId: string | null;
  style: MarkerStyle;
  /** Drives the pulse rings; pass the frame time. */
  now: number;
}) {
  const { pixelRatio } = viewport;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(
    0,
    0,
    viewport.width * pixelRatio,
    viewport.height * pixelRatio
  );
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const dots = new Path2D();
  const ring = new Path2D();
  const margin = MARKER_VIEWPORT_MARGIN;
  context.fillStyle = style.fill;
  for (const offset of copyOffsets) {
    for (const marker of markers) {
      const x = transform.applyX(marker.x + offset);
      const y = transform.applyY(marker.y);
      if (
        x < -margin ||
        x > viewport.width + margin ||
        y < -margin ||
        y > viewport.height + margin
      ) {
        continue;
      }
      if (marker.pulses) {
        drawPulse(context, marker, x, y, now);
      }
      dots.moveTo(x + marker.radius, y);
      dots.arc(x, y, marker.radius, 0, FULL_TURN);
      if (marker.id === activeId) {
        const ringRadius = marker.radius + MARKER_ACTIVE_RING_GAP;
        ring.moveTo(x + ringRadius, y);
        ring.arc(x, y, ringRadius, 0, FULL_TURN);
      }
    }
  }

  context.globalAlpha = 1;
  context.fillStyle = style.fill;
  context.fill(dots);
  context.strokeStyle = style.stroke;
  context.lineWidth = MARKER_STROKE_WIDTH;
  context.stroke(dots);

  if (activeId) {
    context.strokeStyle = style.ring;
    context.lineWidth = MARKER_STROKE_WIDTH;
    context.stroke(ring);
  }
}

/** A ring that grows out of the dot and fades, each dot on its own beat. */
function drawPulse(
  context: CanvasRenderingContext2D,
  marker: DrawnMarker,
  x: number,
  y: number,
  now: number
) {
  const offset = hashPhase(marker.id) * MARKER_PULSE_DURATION_MS;
  const phase =
    ((now + offset) % MARKER_PULSE_DURATION_MS) / MARKER_PULSE_DURATION_MS;
  const eased = 1 - (1 - phase) * (1 - phase);
  const radius = marker.radius * (1 + (MARKER_PULSE_SPREAD - 1) * eased);
  context.globalAlpha = MARKER_PULSE_ALPHA * (1 - eased);
  context.beginPath();
  context.arc(x, y, radius, 0, FULL_TURN);
  context.fill();
}

function hashPhase(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % HASH_MODULUS;
  }
  return (hash % PHASE_STEPS) / PHASE_STEPS;
}
