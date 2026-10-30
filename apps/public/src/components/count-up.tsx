'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 1100;
// Leading symbols, the number itself, trailing unit: "$412.30", "19.9M", "8,634".
const NUMBER_PATTERN = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/;

function easeOut(progress: number) {
  return 1 - (1 - progress) ** 3;
}

// Counts a formatted number up from zero the first time it scrolls into view.
// Values that are not a plain number ("1m 0s") render as they are.
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    const match = NUMBER_PATTERN.exec(value);
    if (!(element && match)) {
      return;
    }
    const [, prefix, digits, suffix] = match;
    const target = Number(digits.replaceAll(',', ''));
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    const grouped = digits.includes(',');
    const format = (current: number) =>
      `${prefix}${current.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      })}${suffix}`;

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / DURATION_MS, 1);
          setShown(format(target * easeOut(progress)));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={ref}>{shown}</span>;
}
