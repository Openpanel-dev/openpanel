import { useEffect, useRef, useState } from 'react';
import {
  FEED_MAX_ITEMS,
  FEED_RELEASE_MS,
  FEED_SEEN_LIMIT,
} from './live-constants';

/**
 * Turns a newest-first list that is refetched in bursts into a feed that
 * gains one item at a time. The first load shows at once; later arrivals
 * queue up and drop in on a steady beat. A new `resetKey` means a different
 * list, so its first load shows at once too.
 */
export function useLiveFeed<T extends { id: string }>(
  items: T[] | undefined,
  resetKey = ''
) {
  const [shown, setShown] = useState<T[]>([]);
  const seenIds = useRef(new Set<string>());
  const queue = useRef<T[]>([]);
  const primedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!items) {
      return;
    }

    if (primedFor.current !== resetKey) {
      primedFor.current = resetKey;
      queue.current = [];
      seenIds.current = new Set(items.map((item) => item.id));
      setShown(items.slice(0, FEED_MAX_ITEMS));
      return;
    }

    if (seenIds.current.size > FEED_SEEN_LIMIT) {
      seenIds.current = new Set(items.map((item) => item.id));
      return;
    }

    const arrivals = items.filter((item) => !seenIds.current.has(item.id));
    for (const item of arrivals) {
      seenIds.current.add(item.id);
    }
    // Oldest first, and only as many as the feed can show anyway.
    queue.current = [...queue.current, ...arrivals.reverse()].slice(
      -FEED_MAX_ITEMS
    );
  }, [items, resetKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = queue.current.shift();
      if (next) {
        setShown((previous) => [next, ...previous].slice(0, FEED_MAX_ITEMS));
      }
    }, FEED_RELEASE_MS);
    return () => clearInterval(interval);
  }, []);

  return shown;
}

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}
