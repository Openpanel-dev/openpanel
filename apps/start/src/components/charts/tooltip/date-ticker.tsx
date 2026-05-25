"use client";

import { motion, useSpring } from "motion/react";
import { useMemo, useRef } from "react";

const TICKER_ITEM_HEIGHT = 24;

export interface DateTickerProps {
  currentIndex: number;
  labels: string[];
  visible: boolean;
}

export function DateTicker({ currentIndex, labels, visible }: DateTickerProps) {
  // Parse labels into month and day parts
  const parsedLabels = useMemo(() => {
    return labels.map((label, index) => {
      const parts = label.split(" ");
      const month = parts[0] || "";
      const day = parts[1] || "";
      return { month, day, full: label, key: `${label}::${index}` };
    });
  }, [labels]);

  // Month segments: one entry per consecutive run (Jan → Feb → …), keyed by start index
  const monthSegments = useMemo(() => {
    const segments: { month: string; key: string; startIndex: number }[] = [];

    parsedLabels.forEach((label, index) => {
      const prev = segments.at(-1);
      if (!prev || prev.month !== label.month) {
        segments.push({
          month: label.month,
          key: `${label.month}-${index}`,
          startIndex: index,
        });
      }
    });

    return segments;
  }, [parsedLabels]);

  // Index into monthSegments for the current data point
  const currentMonthIndex = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= parsedLabels.length) {
      return 0;
    }
    for (let i = monthSegments.length - 1; i >= 0; i--) {
      const segment = monthSegments[i];
      if (segment && segment.startIndex <= currentIndex) {
        return i;
      }
    }
    return 0;
  }, [currentIndex, parsedLabels.length, monthSegments]);

  // Track previous month index
  const prevMonthIndexRef = useRef(-1);

  // Animated Y offsets
  const dayY = useSpring(0, { stiffness: 400, damping: 35 });
  const monthY = useSpring(0, { stiffness: 400, damping: 35 });

  dayY.set(-currentIndex * TICKER_ITEM_HEIGHT);

  if (currentMonthIndex >= 0) {
    const isFirstRender = prevMonthIndexRef.current === -1;
    const monthChanged = prevMonthIndexRef.current !== currentMonthIndex;
    if (isFirstRender || monthChanged) {
      monthY.set(-currentMonthIndex * TICKER_ITEM_HEIGHT);
      prevMonthIndexRef.current = currentMonthIndex;
    }
  }

  if (!visible || labels.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-full bg-zinc-900 px-4 py-1 text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
      <div className="relative h-6 overflow-hidden">
        <div className="flex items-center justify-center gap-1">
          {/* Month stack */}
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: monthY }}>
              {monthSegments.map((segment) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={segment.key}
                >
                  <span className="whitespace-nowrap font-medium text-sm">
                    {segment.month}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Day stack */}
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: dayY }}>
              {parsedLabels.map((label) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={label.key}
                >
                  <span className="whitespace-nowrap font-medium text-sm">
                    {label.day}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

DateTicker.displayName = "DateTicker";

export default DateTicker;
