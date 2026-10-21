export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 24;
export const MAP_ZOOM_BUTTON_FACTOR = 1.8;
export const MAP_ZOOM_ANIMATION_MS = 300;
export const NIGHT_REFRESH_MS = 60_000;

/** A country gets its name once it covers this many square pixels on screen. */
export const LABEL_MIN_SCREEN_AREA = 9000;
export const LABEL_MAX_COUNT = 40;
/** Twilight: the night shade fades in over this many degrees past the terminator. */
export const NIGHT_FEATHER_DEGREES = 18;
export const NIGHT_FEATHER_STEPS = 12;
export const NIGHT_MAX_ALPHA_DARK = 0.22;
export const NIGHT_MAX_ALPHA_LIGHT = 0.05;

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
