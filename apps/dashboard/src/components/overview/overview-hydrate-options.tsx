'use client';

import { getStorageItem } from '@/utils/storage';
import { useEffect, useRef } from 'react';
import { useOverviewOptions } from './useOverviewOptions';

export function OverviewHydrateOptions() {
  const { setRange, range } = useOverviewOptions();
  const ref = useRef<boolean>(false);

  useEffect(() => {
    if (!ref.current) {
      const range = getStorageItem('range', '7d');
      if (range !== '7d') {
        setRange(range);
      }
      ref.current = true;
    }
  }, []);

  return null;
}
