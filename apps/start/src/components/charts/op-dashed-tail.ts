import type { IInterval } from '@openpanel/validation';

interface UseDashedTailOptions<T extends { date: string | Date }> {
  data: T[];
  range: string | null | undefined;
  interval: IInterval;
}

/**
 * Returns the `dashFromIndex` to pass to a bklit `<Line>` / `<Area>` /
 * `<SeriesBar>` so the in-progress current period (and any future-extending
 * buckets that haven't happened yet) render as a dashed tail.
 *
 * Two cases:
 * - Data ends in the past or at the current bucket (e.g. `30d` ending today).
 *   We dash the very last segment so today's incomplete bucket reads as
 *   "not done yet" → `dashFromIndex = data.length - 2`.
 * - Data extends into the future (e.g. `today` with hourly buckets — there's
 *   a bucket per hour through midnight). We dash everything from the
 *   current-hour bucket onward → `dashFromIndex = currentBucketIndex`.
 *
 * Returns `undefined` when there's nothing to dash (too little data or
 * "now" hasn't reached the first bucket yet).
 */
export function useDashedTail<T extends { date: string | Date }>({
  data,
  range,
  interval: _interval,
}: UseDashedTailOptions<T>): number | undefined {
  if (data.length < 2) return undefined;

  const now = Date.now();
  let currentIdx = -1;
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item) continue;
    const t =
      item.date instanceof Date ? item.date.getTime() : new Date(item.date).getTime();
    if (t <= now) {
      currentIdx = i;
    } else {
      break;
    }
  }

  if (currentIdx < 0) {
    // All buckets are in the future — nothing to dash.
    return undefined;
  }

  if (currentIdx === data.length - 1) {
    // Data ends at "now" (or in the past). Dash only the last segment so the
    // current-period bucket reads as incomplete. Skip dashing entirely if the
    // last bucket sits well in the past (i.e. no in-progress period at all).
    return range === 'today' || isLastBucketInProgress(data, now)
      ? data.length - 2
      : undefined;
  }

  // Data extends into the future — dash from one bucket *before* the segment
  // leading into the in-progress bucket so the full descent into zero reads
  // as "incomplete + future" rather than ending mid-cliff with a solid line.
  return Math.max(0, currentIdx - 2);
}

function isLastBucketInProgress<T extends { date: string | Date }>(
  data: T[],
  now: number,
): boolean {
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  if (!(last && prev)) return false;
  const lastT =
    last.date instanceof Date ? last.date.getTime() : new Date(last.date).getTime();
  const prevT =
    prev.date instanceof Date ? prev.date.getTime() : new Date(prev.date).getTime();
  // Bucket width = gap between consecutive points. If "now" lies within the
  // last bucket's window, it's in progress.
  const bucketMs = lastT - prevT;
  return now >= lastT && now < lastT + bucketMs;
}
