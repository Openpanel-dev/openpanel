import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REALTIME_LAYOUT,
  parseRealtimeLayout,
  type RealtimeLayout,
} from './live-layout';
import { readStorage, writeStorage } from './live-storage';

/**
 * The widget layout, remembered per browser and project. It is null until
 * storage has been read after mount, so the server-rendered HTML and the first
 * client render agree and a saved layout never flashes the default one.
 */
export function useRealtimeLayout(projectId: string) {
  const storageKey = `realtime-layout-${projectId}`;
  const [layout, setLayout] = useState<RealtimeLayout | null>(null);

  useEffect(() => {
    setLayout(parseRealtimeLayout(readStorage(storageKey)));
  }, [storageKey]);

  const saveLayout = useCallback(
    (next: RealtimeLayout) => {
      setLayout(next);
      writeStorage(storageKey, JSON.stringify(next));
    },
    [storageKey]
  );

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_REALTIME_LAYOUT);
    writeStorage(storageKey, null);
  }, [storageKey]);

  return { layout, saveLayout, resetLayout };
}
