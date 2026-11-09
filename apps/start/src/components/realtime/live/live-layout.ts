import { z } from 'zod';

export const REALTIME_WIDGET_IDS = [
  'online',
  'visitors',
  'sessions',
  'events',
  'people',
  'groups',
  'pages',
] as const;

export type RealtimeWidgetId = (typeof REALTIME_WIDGET_IDS)[number];
export type RealtimeColumn = 'left' | 'right';
export type RealtimePlacement = RealtimeColumn | 'hidden';

export interface RealtimeLayout {
  left: RealtimeWidgetId[];
  right: RealtimeWidgetId[];
  showIsland: boolean;
}

export const DEFAULT_REALTIME_LAYOUT: RealtimeLayout = {
  left: ['online', 'sessions'],
  right: ['visitors', 'events'],
  showIsland: true,
};

const zStoredLayout = z.object({
  left: z.array(z.string()),
  right: z.array(z.string()),
  showIsland: z.boolean(),
});

function isWidgetId(id: string): id is RealtimeWidgetId {
  return REALTIME_WIDGET_IDS.some((widgetId) => widgetId === id);
}

/** Tolerates old or hand-edited storage: unknown ids and repeats are dropped. */
export function parseRealtimeLayout(stored: string | null): RealtimeLayout {
  if (stored === null) {
    return DEFAULT_REALTIME_LAYOUT;
  }

  let json: unknown;
  try {
    json = JSON.parse(stored);
  } catch {
    return DEFAULT_REALTIME_LAYOUT;
  }

  const parsed = zStoredLayout.safeParse(json);
  if (!parsed.success) {
    return DEFAULT_REALTIME_LAYOUT;
  }

  const left = [...new Set(parsed.data.left.filter(isWidgetId))];
  const right = [...new Set(parsed.data.right.filter(isWidgetId))].filter(
    (id) => !left.includes(id)
  );

  return { left, right, showIsland: parsed.data.showIsland };
}

export function getWidgetPlacement(
  layout: RealtimeLayout,
  id: RealtimeWidgetId
): RealtimePlacement {
  if (layout.left.includes(id)) {
    return 'left';
  }
  return layout.right.includes(id) ? 'right' : 'hidden';
}

export function placeWidget(
  layout: RealtimeLayout,
  id: RealtimeWidgetId,
  placement: RealtimePlacement
): RealtimeLayout {
  if (getWidgetPlacement(layout, id) === placement) {
    return layout;
  }

  const left = layout.left.filter((widgetId) => widgetId !== id);
  const right = layout.right.filter((widgetId) => widgetId !== id);

  return {
    ...layout,
    left: placement === 'left' ? [...left, id] : left,
    right: placement === 'right' ? [...right, id] : right,
  };
}

export function shiftWidget(
  layout: RealtimeLayout,
  id: RealtimeWidgetId,
  offset: -1 | 1
): RealtimeLayout {
  const column = getWidgetPlacement(layout, id);
  if (column === 'hidden') {
    return layout;
  }

  const ids = [...layout[column]];
  const from = ids.indexOf(id);
  const to = from + offset;
  const neighbour = ids[to];
  if (neighbour === undefined) {
    return layout;
  }

  ids[to] = id;
  ids[from] = neighbour;

  return { ...layout, [column]: ids };
}
