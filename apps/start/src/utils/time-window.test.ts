import { describe, expect, it } from 'vitest';
import {
  canStepTimeWindow,
  formatTimeWindowBoundary,
  resolveTimeWindow,
  stepTimeWindow,
} from './time-window';

const now = new Date(2026, 9, 23, 14, 30, 0);
const boundary = (date: Date) => formatTimeWindowBoundary(date);

describe('resolveTimeWindow', () => {
  it('resolves "today" to the whole current day', () => {
    const bounds = resolveTimeWindow('today', null, null, now);
    expect(boundary(bounds.start)).toBe('2026-10-23 00:00:00');
    expect(boundary(bounds.end)).toBe('2026-10-23 23:59:59');
    expect(bounds).toMatchObject({ unit: 'day', size: 1 });
  });

  it('resolves "7d" the way the API does: eight calendar days', () => {
    const bounds = resolveTimeWindow('7d', null, null, now);
    expect(boundary(bounds.start)).toBe('2026-10-16 00:00:00');
    expect(bounds).toMatchObject({ unit: 'day', size: 8 });
  });

  it('resolves "lastMonth" to a month-aligned window', () => {
    const bounds = resolveTimeWindow('lastMonth', null, null, now);
    expect(boundary(bounds.start)).toBe('2026-09-01 00:00:00');
    expect(boundary(bounds.end)).toBe('2026-09-30 23:59:59');
    expect(bounds).toMatchObject({ unit: 'month', size: 1 });
  });

  it('prefers explicit dates over the range key', () => {
    const bounds = resolveTimeWindow(
      '30d',
      '2026-10-10 00:00:00',
      '2026-10-16 23:59:59',
      now
    );
    expect(bounds).toMatchObject({ unit: 'day', size: 7 });
  });

  it('treats an exclusive midnight end as the previous whole day', () => {
    const bounds = resolveTimeWindow(
      'custom',
      '2026-10-10 00:00:00',
      '2026-10-24 00:00:00',
      now
    );
    expect(boundary(bounds.end)).toBe('2026-10-23 23:59:59');
    expect(bounds).toMatchObject({ unit: 'day', size: 14 });
  });

  it('recognises whole months in custom dates', () => {
    const bounds = resolveTimeWindow(
      'custom',
      '2026-08-01 00:00:00',
      '2026-09-30 23:59:59',
      now
    );
    expect(bounds).toMatchObject({ unit: 'month', size: 2 });
  });

  it('keeps sub-day custom dates as a minute window', () => {
    const bounds = resolveTimeWindow(
      'custom',
      '2026-10-23 14:00:00',
      '2026-10-23 14:30:00',
      now
    );
    expect(bounds).toMatchObject({ unit: 'minute', size: 30 });
  });
});

describe('stepTimeWindow', () => {
  it('moves a day window back by its own length without overlap', () => {
    const bounds = resolveTimeWindow(
      'custom',
      '2026-10-17 00:00:00',
      '2026-10-23 23:59:59',
      now
    );
    const previous = stepTimeWindow(bounds, 'previous');
    expect(boundary(previous.start)).toBe('2026-10-10 00:00:00');
    expect(boundary(previous.end)).toBe('2026-10-16 23:59:59');
    const next = stepTimeWindow(previous, 'next');
    expect(boundary(next.start)).toBe('2026-10-17 00:00:00');
    expect(boundary(next.end)).toBe('2026-10-23 23:59:59');
  });

  it('steps "last month" to the full month before it', () => {
    const bounds = resolveTimeWindow('lastMonth', null, null, now);
    const previous = stepTimeWindow(bounds, 'previous');
    expect(boundary(previous.start)).toBe('2026-08-01 00:00:00');
    expect(boundary(previous.end)).toBe('2026-08-31 23:59:59');
  });

  it('steps "last year" to the full year before it', () => {
    const bounds = resolveTimeWindow('lastYear', null, null, now);
    const previous = stepTimeWindow(bounds, 'previous');
    expect(boundary(previous.start)).toBe('2024-01-01 00:00:00');
    expect(boundary(previous.end)).toBe('2024-12-31 23:59:59');
  });

  it('steps a minute window by its duration', () => {
    const bounds = resolveTimeWindow('30min', null, null, now);
    const previous = stepTimeWindow(bounds, 'previous');
    expect(boundary(previous.start)).toBe('2026-10-23 13:30:00');
    expect(boundary(previous.end)).toBe('2026-10-23 14:00:00');
  });
});

describe('canStepTimeWindow', () => {
  it('always allows stepping back', () => {
    const bounds = resolveTimeWindow('today', null, null, now);
    expect(canStepTimeWindow(bounds, 'previous', now)).toBe(true);
  });

  it('refuses to step into a window that starts in the future', () => {
    const bounds = resolveTimeWindow('today', null, null, now);
    expect(canStepTimeWindow(bounds, 'next', now)).toBe(false);
    const yesterday = resolveTimeWindow('yesterday', null, null, now);
    expect(canStepTimeWindow(yesterday, 'next', now)).toBe(true);
  });
});
