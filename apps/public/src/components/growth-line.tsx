'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const WIDTH = 1440;
const HEIGHT = 320;
const POINT_COUNT = 90;
const PATH_LENGTH = 1800;
const START_VISITORS = 1180;
const DAY_MS = 86_400_000;

// Deterministic noisy growth so the server and client draw the same curve.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

interface Point {
  x: number;
  y: number;
  value: number;
  daysAgo: number;
}

function buildSeries(): Point[] {
  const random = seeded(11);
  const points: Point[] = [];
  let value = 0.1;
  for (let index = 0; index < POINT_COUNT; index++) {
    const progress = index / (POINT_COUNT - 1);
    // Weekly rhythm on top of accelerating growth, like real web traffic.
    const weekday = index % 7;
    const weekend = weekday === 5 || weekday === 6 ? -0.035 : 0.005;
    const drift = 0.006 + progress * 0.012;
    const noise = (random() - 0.5) * 0.045;
    value = Math.max(0.04, value + drift + noise + weekend);
    points.push({
      x: progress * WIDTH,
      y: HEIGHT - value * (HEIGHT * 0.72) - 20,
      value: Math.round(START_VISITORS * (1 + value * 9)),
      daysAgo: POINT_COUNT - 1 - index,
    });
  }
  return points;
}

// Monotone cubic interpolation: smooth, and never overshoots the data.
function monotonePath(points: Point[]) {
  const n = points.length;
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    deltas.push(
      (points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x)
    );
  }
  const slopes: number[] = [deltas[0]];
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
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) / 3;
    d += ` C${p0.x + dx},${p0.y + slopes[i] * dx} ${p1.x - dx},${p1.y - slopes[i + 1] * dx} ${p1.x},${p1.y}`;
  }
  return d;
}

const POINTS = buildSeries();
const LINE = monotonePath(POINTS);
const AREA = `${LINE} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
const LAST = POINTS.at(-1) as Point;

function formatDay(daysAgo: number) {
  return new Date(Date.now() - daysAgo * DAY_MS).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function GrowthLine({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState<Point | null>(null);

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

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (POINT_COUNT - 1));
    setHovered(POINTS[Math.min(Math.max(index, 0), POINT_COUNT - 1)]);
  };

  const active = hovered ?? LAST;
  const labelOnLeft = active.x > WIDTH * 0.8;

  return (
    <svg
      aria-hidden
      className={cn('cursor-crosshair', className)}
      onPointerLeave={() => setHovered(null)}
      onPointerMove={handleMove}
      preserveAspectRatio="xMidYMax slice"
      ref={ref}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <title>Visitors over the last 90 days</title>
      <defs>
        <linearGradient id="growth-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.16" />
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
        strokeOpacity="0.55"
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
        {hovered && (
          <line
            stroke="#2563eb"
            strokeDasharray="3 4"
            strokeOpacity="0.35"
            vectorEffect="non-scaling-stroke"
            x1={hovered.x}
            x2={hovered.x}
            y1={0}
            y2={HEIGHT}
          />
        )}
        {!hovered && (
          <circle
            className="animate-ping [transform-box:fill-box] [transform-origin:center]"
            cx={LAST.x}
            cy={LAST.y}
            fill="#2563eb"
            fillOpacity="0.25"
            r="7"
          />
        )}
        <circle
          cx={active.x}
          cy={active.y}
          fill="#2563eb"
          r="4"
          stroke="white"
          strokeWidth="2"
        />
        <foreignObject
          height="60"
          width="150"
          x={labelOnLeft ? active.x - 162 : active.x + 12}
          y={Math.max(active.y - 58, 4)}
        >
          <div
            className={cn(
              'col w-fit rounded-lg bg-neutral-900 px-2.5 py-1.5 text-white shadow-lg',
              labelOnLeft && 'ml-auto'
            )}
          >
            <span className="font-mono font-semibold text-[13px] leading-tight">
              {active.value.toLocaleString('en-US')}
            </span>
            <span className="text-[10px] text-neutral-400 leading-tight">
              {hovered ? formatDay(hovered.daysAgo) : 'visitors today'}
            </span>
          </div>
        </foreignObject>
      </g>
    </svg>
  );
}
