'use client';

import { useEffect, useRef, useState } from 'react';
import type { HeatmapTooltipData } from './heatmap-context';

export function useDelayedTooltipData(
  tooltipData: HeatmapTooltipData | null,
  showDelay: number,
  hideDelay: number
): HeatmapTooltipData | null {
  const [displayData, setDisplayData] = useState<HeatmapTooltipData | null>(
    null
  );
  const isShowingRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = undefined;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }

    if (tooltipData) {
      if (isShowingRef.current) {
        setDisplayData(tooltipData);
        return;
      }

      if (showDelay === 0) {
        isShowingRef.current = true;
        setDisplayData(tooltipData);
        return;
      }

      showTimerRef.current = setTimeout(() => {
        isShowingRef.current = true;
        setDisplayData(tooltipData);
      }, showDelay);
      return;
    }

    if (hideDelay === 0) {
      isShowingRef.current = false;
      setDisplayData(null);
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      isShowingRef.current = false;
      setDisplayData(null);
    }, hideDelay);
  }, [tooltipData, showDelay, hideDelay]);

  useEffect(
    () => () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    },
    []
  );

  return displayData;
}
