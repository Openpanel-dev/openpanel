'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const WIDTH = 1440;
const HEIGHT = 320;
const POINT_COUNT = 56;
const PATH_LENGTH = 1800;

// Deterministic noisy growth so the server and client draw the same curve.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function buildSeries(): [number, number][] {
  const random = seeded(7);
  const points: [number, number][] = [];
  let value = 0.12;
  for (let index = 0; index < POINT_COUNT; index++) {
    const progress = index / (POINT_COUNT - 1);
    const drift = 0.0115 + progress * 0.014;
    const noise = (random() - 0.5) * 0.07;
    value = Math.max(0.05, value + drift + noise);
    points.push([
      (index / (POINT_COUNT - 1)) * WIDTH,
      HEIGHT - value * (HEIGHT * 0.78) - 16,
    ]);
  }
  return points;
}

// Monotone cubic interpolation: smooth, and never overshoots the data.
function monotonePath(points: [number, number][]) {
  const n = points.length;
  const slopes: number[] = [];
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    deltas.push((y1 - y0) / (x1 - x0));
  }
  slopes.push(deltas[0]);
  for (let i = 1; i < n - 1; i++) {
    const a = deltas[i - 1];
    const b = deltas[i];
    slopes.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  slopes.push(deltas[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (deltas[i] === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const alpha = slopes[i] / deltas[i];
    const beta = slopes[i + 1] / deltas[i];
    const size = alpha * alpha + beta * beta;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      slopes[i] = scale * alpha * deltas[i];
      slopes[i + 1] = scale * beta * deltas[i];
    }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    d += ` C${x0 + dx},${y0 + slopes[i] * dx} ${x1 - dx},${y1 - slopes[i + 1] * dx} ${x1},${y1}`;
  }
  return d;
}

const POINTS = buildSeries();
const LINE = monotonePath(POINTS);
const AREA = `${LINE} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
const [END_X, END_Y] = POINTS.at(-1) ?? [WIDTH, 0];

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
      preserveAspectRatio="xMidYMax slice"
      ref={ref}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <defs>
        <linearGradient id="growth-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={cn(
          'transition-opacity delay-1000 duration-1000',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        d={AREA}
        fill="url(#growth-area)"
      />
      <path
        className={cn(visible && 'animate-draw-line')}
        d={LINE}
        fill="none"
        stroke="#2563eb"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.4"
        strokeWidth="2"
        style={{
          strokeDasharray: PATH_LENGTH,
          strokeDashoffset: visible ? undefined : PATH_LENGTH,
        }}
        vectorEffect="non-scaling-stroke"
      />
      <g
        className={cn(
          'transition-opacity delay-[1800ms] duration-500',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      >
        <circle
          className="animate-ping [transform-box:fill-box] [transform-origin:center]"
          cx={END_X}
          cy={END_Y}
          fill="#2563eb"
          fillOpacity="0.25"
          r="7"
        />
        <circle cx={END_X} cy={END_Y} fill="#2563eb" r="3.5" />
      </g>
    </svg>
  );
}
