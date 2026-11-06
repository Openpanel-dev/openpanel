import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REALTIME_LAYOUT,
  getWidgetPlacement,
  parseRealtimeLayout,
  placeWidget,
  type RealtimeLayout,
  shiftWidget,
} from './live-layout';

const layout: RealtimeLayout = {
  left: ['online', 'sessions'],
  right: ['visitors', 'events'],
  showIsland: true,
};

describe('parseRealtimeLayout', () => {
  it('falls back to the default for nothing stored, bad JSON or a bad shape', () => {
    expect(parseRealtimeLayout(null)).toEqual(DEFAULT_REALTIME_LAYOUT);
    expect(parseRealtimeLayout('{nope')).toEqual(DEFAULT_REALTIME_LAYOUT);
    expect(parseRealtimeLayout('{"left":1}')).toEqual(DEFAULT_REALTIME_LAYOUT);
  });

  it('drops unknown ids and keeps a widget in one place only', () => {
    const stored = JSON.stringify({
      left: ['people', 'retired-widget', 'people'],
      right: ['people', 'events'],
      showIsland: false,
    });

    expect(parseRealtimeLayout(stored)).toEqual({
      left: ['people'],
      right: ['events'],
      showIsland: false,
    });
  });

  it('round-trips a layout with empty columns', () => {
    const empty: RealtimeLayout = { left: [], right: [], showIsland: true };

    expect(parseRealtimeLayout(JSON.stringify(empty))).toEqual(empty);
  });
});

describe('placeWidget', () => {
  it('moves a widget to the end of the other column', () => {
    const moved = placeWidget(layout, 'events', 'left');

    expect(moved.left).toEqual(['online', 'sessions', 'events']);
    expect(moved.right).toEqual(['visitors']);
  });

  it('shows a hidden widget and hides a shown one', () => {
    const shown = placeWidget(layout, 'people', 'right');
    expect(shown.right).toEqual(['visitors', 'events', 'people']);

    const hidden = placeWidget(shown, 'people', 'hidden');
    expect(getWidgetPlacement(hidden, 'people')).toBe('hidden');
    expect(hidden.right).toEqual(['visitors', 'events']);
  });

  it('keeps the order when the widget is already there', () => {
    expect(placeWidget(layout, 'online', 'left')).toBe(layout);
  });
});

describe('shiftWidget', () => {
  it('swaps a widget with its neighbour', () => {
    expect(shiftWidget(layout, 'sessions', -1).left).toEqual([
      'sessions',
      'online',
    ]);
  });

  it('stops at the ends of a column and ignores hidden widgets', () => {
    expect(shiftWidget(layout, 'online', -1)).toBe(layout);
    expect(shiftWidget(layout, 'sessions', 1)).toBe(layout);
    expect(shiftWidget(layout, 'people', 1)).toBe(layout);
  });
});
