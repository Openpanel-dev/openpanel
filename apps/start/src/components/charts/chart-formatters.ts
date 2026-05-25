/**
 * Module-scope Intl formatters. Constructing `Intl.DateTimeFormat` /
 * `Intl.NumberFormat` is expensive (~10–50× slower per call than reusing one),
 * and the implicit constructions hidden in `toLocaleDateString` / `toLocaleString`
 * pile up fast when called inside `.map()` loops over axis ticks, tooltip rows,
 * or live-chart data points.
 *
 * Mirrors bklit-ui's `charts/chart-formatters.ts` (issue #64).
 */

export const shortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export const weekdayDateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export const hmsTimeFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract
// and reuse without `this` binding loss.
export const intFmt = new Intl.NumberFormat('en-US').format;
