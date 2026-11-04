import {
  ChromeIcon,
  GlobeIcon,
  MonitorIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { Panel } from './primitives';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// The realtime page: a world map with live dots and floating cards.

// Land as a coarse dot matrix, 48 columns × 20 rows from 80°N to 60°S.
// Each row lists [start, end) column ranges.
const LAND: [number, number][][] = [
  [
    [10, 16],
    [17, 23],
    [26, 27],
    [30, 45],
  ],
  [
    [3, 7],
    [7, 17],
    [17, 23],
    [25, 28],
    [29, 46],
  ],
  [
    [2, 7],
    [7, 16],
    [18, 22],
    [25, 28],
    [28, 46],
  ],
  [
    [3, 6],
    [8, 17],
    [23, 24],
    [25, 46],
  ],
  [
    [6, 17],
    [23, 45],
  ],
  [
    [6, 15],
    [23, 31],
    [31, 42],
    [43, 45],
  ],
  [
    [7, 14],
    [22, 30],
    [30, 41],
    [43, 44],
  ],
  [
    [6, 12],
    [13, 14],
    [21, 31],
    [31, 40],
    [41, 42],
  ],
  [
    [7, 11],
    [12, 15],
    [20, 31],
    [31, 39],
    [40, 42],
  ],
  [
    [10, 13],
    [20, 31],
    [33, 38],
    [40, 41],
  ],
  [
    [12, 16],
    [21, 31],
    [35, 36],
    [37, 41],
    [42, 45],
  ],
  [
    [12, 18],
    [22, 31],
    [36, 40],
    [42, 45],
  ],
  [
    [12, 18],
    [22, 30],
    [37, 40],
    [41, 44],
  ],
  [
    [13, 18],
    [22, 29],
    [29, 30],
    [41, 45],
  ],
  [
    [13, 17],
    [23, 29],
    [29, 30],
    [40, 46],
  ],
  [
    [13, 17],
    [23, 28],
    [40, 46],
  ],
  [
    [14, 16],
    [24, 27],
    [43, 45],
    [46, 47],
  ],
  [
    [14, 16],
    [43, 44],
    [46, 47],
  ],
  [
    [14, 16],
    [45, 46],
  ],
  [[14, 15]],
];

const COLUMNS = 48;
const ROWS = LAND.length;

export interface MapDot {
  x: number;
  y: number;
  size?: number;
}

// Visitors right now, in grid coordinates (column, row).
export const LIVE_DOTS: MapDot[] = [
  { x: 26.3, y: 3.4, size: 3 },
  { x: 25.1, y: 4.2, size: 2 },
  { x: 23.4, y: 3.6, size: 2 },
  { x: 27.8, y: 4.9 },
  { x: 24.6, y: 5.3 },
  { x: 12.2, y: 5.1, size: 2 },
  { x: 9.4, y: 5.6, size: 2 },
  { x: 7.1, y: 5.0 },
  { x: 13.6, y: 6.6 },
  { x: 16.2, y: 11.8 },
  { x: 36.4, y: 8.2 },
  { x: 33.8, y: 7.4 },
  { x: 43.6, y: 5.3, size: 2 },
  { x: 44.2, y: 14.6 },
  { x: 30.1, y: 10.9 },
];

export function MockMap({
  dots = LIVE_DOTS,
  tone = 'blue',
  className,
  compact = false,
}: {
  dots?: MapDot[];
  tone?: 'blue' | 'green';
  className?: string;
  compact?: boolean;
}) {
  const colour = tone === 'green' ? '#10b981' : '#2563eb';
  return (
    <svg
      className={cn('w-full', className)}
      role="img"
      viewBox={`0 0 ${COLUMNS} ${ROWS}`}
    >
      <title>World map</title>
      {LAND.flatMap((ranges, row) =>
        ranges.flatMap(([start, end]) =>
          Array.from({ length: end - start }, (_, offset) => {
            const column = start + offset;
            return (
              <circle
                cx={column + 0.5}
                cy={row + 0.5}
                fill="#d4d4d4"
                key={`${row}-${column}`}
                r={compact ? 0.28 : 0.3}
              />
            );
          })
        )
      )}
      {dots.map((dot) => (
        <g key={`${dot.x}-${dot.y}`}>
          <circle
            cx={dot.x}
            cy={dot.y}
            fill={colour}
            fillOpacity="0.18"
            r={(dot.size ?? 1) * 0.55 + 0.5}
          />
          <circle
            cx={dot.x}
            cy={dot.y}
            fill={colour}
            r={(dot.size ?? 1) * 0.22 + 0.28}
          />
        </g>
      ))}
    </svg>
  );
}

const NEW_SESSIONS = [
  { where: 'Stockholm', path: '/pricing', device: 'desktop', age: '2s' },
  { where: 'Berlin', path: '/', device: 'mobile', age: '9s' },
  { where: 'Austin', path: '/docs/sdks/react', device: 'desktop', age: '14s' },
  { where: 'Lisbon', path: '/compare/posthog', device: 'mobile', age: '31s' },
  { where: 'Tokyo', path: '/articles', device: 'desktop', age: '48s' },
];

const LIVE_EVENTS = [
  { name: 'sign_up', where: 'Stockholm', flag: '🇸🇪', age: '1s' },
  { name: '/pricing', where: 'Berlin', flag: '🇩🇪', age: '4s' },
  { name: 'started_trial', where: 'Austin', flag: '🇺🇸', age: '7s' },
  { name: '/docs/sdks/react', where: 'Austin', flag: '🇺🇸', age: '12s' },
  { name: 'link_out', where: 'Lisbon', flag: '🇵🇹', age: '20s' },
];

const MINUTES = [
  3, 4, 4, 6, 5, 7, 8, 7, 9, 8, 10, 12, 11, 9, 13, 14, 12, 15, 13, 16, 14, 17,
  15, 18, 16, 15, 17, 19, 18, 20,
];

function FloatingCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col gap-2 rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  );
}

function DeviceIcon({ device }: { device: string }) {
  return device === 'mobile' ? (
    <SmartphoneIcon className="size-3 text-neutral-400" />
  ) : (
    <MonitorIcon className="size-3 text-neutral-400" />
  );
}

export function RealtimeContent() {
  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <MockMap className="absolute inset-x-6 top-10 opacity-90" tone="green" />
      <FloatingCard className="absolute top-3 left-3 w-[210px]">
        <div className="row items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono font-semibold text-[26px] leading-none tracking-tight">
            142
          </span>
          <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
            Online now
          </span>
        </div>
        <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
          New sessions
        </span>
        <ul className="col gap-1.5 text-[11px]">
          {NEW_SESSIONS.map((session) => (
            <li className="row items-center gap-1.5" key={session.where}>
              <span className="w-14 truncate text-neutral-700">
                {session.where}
              </span>
              <span className="flex-1 truncate font-mono text-neutral-500">
                {session.path}
              </span>
              <DeviceIcon device={session.device} />
              <span className="font-mono text-[10px] text-neutral-400">
                {session.age}
              </span>
            </li>
          ))}
        </ul>
      </FloatingCard>
      <FloatingCard className="absolute top-3 right-3 w-[220px]">
        <div className="row items-center justify-between">
          <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
            Last 30 minutes
          </span>
          <span className="font-mono text-[10px] text-neutral-500">
            318 sessions
          </span>
        </div>
        <div className="row h-10 items-end gap-px">
          {MINUTES.map((value, index) => (
            <span
              className="flex-1 rounded-t-[1px] bg-emerald-500/80"
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
              key={index}
              style={{ height: `${(value / 20) * 100}%` }}
            />
          ))}
        </div>
        <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
          Events
        </span>
        <ul className="col gap-1.5 text-[11px]">
          {LIVE_EVENTS.map((event) => (
            <li
              className="row items-center gap-1.5"
              key={`${event.name}-${event.age}`}
            >
              <span className="flex-1 truncate font-mono">{event.name}</span>
              <span className="text-neutral-500">{event.where}</span>
              <span className="text-[10px]">{event.flag}</span>
              <span className="font-mono text-[10px] text-neutral-400">
                {event.age}
              </span>
            </li>
          ))}
        </ul>
      </FloatingCard>
      <FloatingCard className="absolute bottom-3 left-1/2 w-[360px] -translate-x-1/2 flex-row gap-6">
        <div className="col flex-1 gap-1 text-[11px]">
          <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
            Referrers
          </span>
          {[
            ['Google', '48'],
            ['Direct', '39'],
            ['Product Hunt', '22'],
          ].map(([name, count]) => (
            <span className="row items-center gap-2" key={name}>
              <ChromeIcon className="size-3 text-neutral-400" />
              <span className="flex-1 truncate">{name}</span>
              <span className="font-mono text-neutral-500">{count}</span>
            </span>
          ))}
        </div>
        <div className="col flex-1 gap-1 text-[11px]">
          <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
            Countries
          </span>
          {[
            ['Sweden', '41'],
            ['United States', '36'],
            ['Germany', '19'],
          ].map(([name, count]) => (
            <span className="row items-center gap-2" key={name}>
              <GlobeIcon className="size-3 text-neutral-400" />
              <span className="flex-1 truncate">{name}</span>
              <span className="font-mono text-neutral-500">{count}</span>
            </span>
          ))}
        </div>
      </FloatingCard>
    </div>
  );
}

export function MiniMap() {
  return (
    <div className="col gap-2">
      <div className="row gap-3 text-[11px]">
        <span className="border-neutral-900 border-b-2 pb-1 font-medium">
          Countries
        </span>
        <span className="pb-1 text-neutral-500">Regions</span>
        <span className="pb-1 text-neutral-500">Cities</span>
        <span className="pb-1 text-neutral-500">Map</span>
      </div>
      <Panel className="p-2" padded={false}>
        <MockMap className="max-h-28" compact />
      </Panel>
    </div>
  );
}

export const REALTIME_MOCKS = {
  realtime: {
    content: () => <RealtimeContent />,
    shell: { page: 'realtime', project: 'Acme Web', range: 'Last 30 min' },
    insetWidth: 900,
  },
  'mini-map': { content: () => <MiniMap /> },
} satisfies Record<string, MockDefinition>;
