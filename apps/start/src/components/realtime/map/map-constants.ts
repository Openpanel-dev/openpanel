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
export const MARKER_STROKE_WIDTH = 1.5;
export const MARKER_ACTIVE_RING_GAP = 4;
/** Dots this far off screen are still drawn, so none pops in at the edge. */
export const MARKER_VIEWPORT_MARGIN = 20;
/** Only the busiest dots pulse, so the ring animation stays cheap on big maps. */
export const MARKER_PULSE_LIMIT = 40;
export const MARKER_PULSE_DURATION_MS = 2400;
export const MARKER_PULSE_SPREAD = 3.2;
export const MARKER_PULSE_ALPHA = 0.45;

/** How long a pan or zoom must pause before the crisp world bitmap is rendered. */
export const RASTER_SETTLE_MS = 120;
/** The crisp bitmap extends this share of the viewport past each edge. */
export const RASTER_DETAIL_MARGIN = 0.25;
export const RASTER_DETAIL_MAX_PIXELS = 12_000_000;
export const RASTER_MAX_PIXEL_RATIO = 2;
/** From this zoom on, the crisp bitmap uses the detailed coastlines. */
export const RASTER_FINE_DETAIL_ZOOM = 3;
/** Size of the cells the detailed border lines are grouped into. */
export const BORDER_BUCKET_DEGREES = 10;
/** Rebuilding the geometry is heavy, so a window resize waits this long to settle. */
export const RESIZE_SETTLE_MS = 150;

/** The detail query accepts at most this many locations. */
export const PLACE_MAX_LOCATIONS = 200;

export const DETAIL_CARD_WIDTH = 380;
export const DETAIL_CARD_MIN_HEIGHT = 340;
export const DETAIL_CARD_INSET = 12;
export const DETAIL_CARD_GAP = 20;
/** How far above the dot the card's top edge starts. */
export const DETAIL_CARD_ANCHOR_OFFSET = 40;
