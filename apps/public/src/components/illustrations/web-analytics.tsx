'use client';

import NumberFlow from '@number-flow/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const VISITOR_DATA = [1840, 2100, 1950, 2400, 2250, 2650, 2980];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATS = [
  { label: 'Visitors', value: 4128, formatted: null, change: 12, up: true },
  { label: 'Page views', value: 12438, formatted: '12.4k', change: 8, up: true },
  { label: 'Bounce rate', value: null, formatted: '42%', change: 3, up: false },
  { label: 'Avg. session', value: null, formatted: '3m 23s', change: 5, up: true },
];

const SOURCES = [
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Fgoogle.com',
    name: 'google.com',
    pct: 49,
  },
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Ftwitter.com',
    name: 'twitter.com',
    pct: 21,
  },
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Fgithub.com',
    name: 'github.com',
    pct: 14,
  },
];

function AreaChart({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const w = 400;
  const h = 64;
  const xStep = w / (data.length - 1);
  const pts = data.map((v, i) => ({ x: i * xStep, y: h - (v / max) * h }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h + 4}`}>
      <defs>
        <linearGradient id="wa-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#wa-fill)" />
      <path
        d={line}
        fill="none"
        stroke="rgb(59 130 246)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx={last.x} cy={last.y} fill="rgb(59 130 246)" r="3" />
      <circle
        cx={last.x}
        cy={last.y}
        fill="none"
        r="6"
        stroke="rgb(59 130 246)"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function WebAnalyticsIllustration() {
  const [liveVisitors, setLiveVisitors] = useState(47);

  useEffect(() => {
    const values = [47, 51, 44, 53, 49, 56];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % values.length;
      setLiveVisitors(values[i]);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="aspect-video col gap-2.5 p-5">
      {/* Header */}
      <div className="row items-center justify-between">
        <div className="row items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            <NumberFlow value={liveVisitors} /> online now
          </span>
        </div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
          Last 7 days
        </span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-1.5">
        {STATS.map((stat) => (
          <div
            className="col gap-0.5 rounded-lg border bg-card px-2 py-1.5"
            key={stat.label}
          >
            <span className="text-[8px] text-muted-foreground">{stat.label}</span>
            <span className="font-mono font-semibold text-xs leading-tight">
              {stat.formatted ??
                (stat.value !== null ? (
                  <NumberFlow locales="en-US" value={stat.value} />
                ) : null)}
            </span>
            <span
              className={`text-[8px] ${stat.up ? 'text-emerald-500' : 'text-red-400'}`}
            >
              {stat.up ? '↑' : '↓'} {stat.change}%
            </span>
          </div>
        ))}
      </div>

      {/* Area chart */}
      <div className="flex-1 col gap-1 overflow-hidden rounded-xl border bg-card px-3 pt-2 pb-1">
        <span className="text-[8px] text-muted-foreground">Unique visitors</span>
        <AreaChart data={VISITOR_DATA} />
        <div className="row justify-between px-0.5">
          {DAYS.map((d) => (
            <span className="text-[7px] text-muted-foreground" key={d}>
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Traffic sources */}
      <div className="row gap-1.5">
        {SOURCES.map((src) => (
          <div
            className="row flex-1 items-center gap-1.5 overflow-hidden rounded-lg border bg-card px-2 py-1.5"
            key={src.name}
          >
            <Image
              alt={src.name}
              className="rounded-[2px] object-contain"
              height={10}
              src={src.icon}
              width={10}
            />
            <span className="flex-1 truncate text-[9px]">{src.name}</span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {src.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
