/** Gap between two feed items arriving, so a burst reads like a chat stream. */
export const FEED_RELEASE_MS = 400;
export const FEED_MAX_ITEMS = 24;
/** Forget ids beyond this; the feed only needs to recognise recent ones. */
export const FEED_SEEN_LIMIT = 1000;
export const FEED_CLOCK_MS = 10_000;

export const ISLAND_TOP_COUNT = 5;

/** Lets the map be dragged far enough that nothing hides under the feeds or the island. */
export const OVERLAY_MAP_OVERSCROLL = { x: 320, y: 160 };
