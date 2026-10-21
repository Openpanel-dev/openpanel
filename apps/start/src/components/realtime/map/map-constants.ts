export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 24;
export const MAP_ZOOM_BUTTON_FACTOR = 1.8;
export const MAP_ZOOM_ANIMATION_MS = 300;
export const NIGHT_REFRESH_MS = 60_000;

/** How strongly land picks up the brand blue over its grey. */
export const LAND_TINT_ALPHA = 0.1;

export const MARKER_MIN_RADIUS = 3.5;
export const MARKER_MAX_RADIUS = 10;
export const MARKER_RADIUS_PER_SQRT_VISITOR = 1.2;
export const MARKER_HIT_RADIUS = 12;
/** Pulsing is a CSS animation per dot; capping it keeps big maps smooth. */
export const MARKER_PULSE_LIMIT = 40;
export const MARKER_VIEWPORT_MARGIN = 40;

/** The detail query accepts at most this many locations. */
export const PLACE_MAX_LOCATIONS = 200;

export const DETAIL_CARD_WIDTH = 380;
export const DETAIL_CARD_MIN_HEIGHT = 340;
export const DETAIL_CARD_INSET = 12;
export const DETAIL_CARD_GAP = 20;
/** How far above the dot the card's top edge starts. */
export const DETAIL_CARD_ANCHOR_OFFSET = 40;
