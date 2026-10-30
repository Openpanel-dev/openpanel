'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// A rising line that draws itself once it scrolls into view.
const POINTS: [number, number][] = [
  [0, 250],
  [90, 215],
  [170, 232],
  [250, 190],
  [330, 205],
  [410, 150],
  [490, 172],
  [570, 120],
  [650, 140],
  [730, 70],
  [810, 95],
  [890, 40],
  [1000, 20],
];

const WIDTH = 1000;
const HEIGHT = 300;
const PATH_LENGTH = 1400;

const line = `M${POINTS.map(([x, y]) => `${x},${y}`).join(' L')}`;
const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

export function GrowthLine({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none', className)}
      preserveAspectRatio="none"
      ref={ref}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <defs>
        <linearGradient id="growth-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={cn(
          'transition-opacity delay-700 duration-1000',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        d={area}
        fill="url(#growth-area)"
      />
      <path
        className={cn(visible && 'animate-draw-line')}
        d={line}
        fill="none"
        stroke="#2563eb"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        style={{
          strokeDasharray: PATH_LENGTH,
          strokeDashoffset: visible ? undefined : PATH_LENGTH,
        }}
        vectorEffect="non-scaling-stroke"
      />
      {POINTS.map(([x, y], index) => (
        <circle
          className={cn(
            'transition-opacity duration-300',
            visible ? 'opacity-100' : 'opacity-0'
          )}
          cx={x}
          cy={y}
          fill="#2563eb"
          fillOpacity="0.5"
          key={`${x}-${y}`}
          r="3"
          style={{ transitionDelay: `${index * 130}ms` }}
        />
      ))}
    </svg>
  );
}
