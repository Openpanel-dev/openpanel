import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

// A scripted replay of the dashboard chat: the visitor sees a question go
// in and an answer with a chart come back, without anything to click.
type ChartKind = 'trend' | 'breakdown' | 'funnel';

type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; chart?: ChartKind };

const SCRIPT: Turn[] = [
  { role: 'user', text: 'How did signups do this week?' },
  {
    role: 'assistant',
    text: 'Up 18% on last week: 1,284 signups against 1,089. The jump came on Tuesday.',
    chart: 'trend',
  },
  { role: 'user', text: 'Where did they come from?' },
  {
    role: 'assistant',
    text: 'Mostly Google and Product Hunt. Direct visitors convert best.',
    chart: 'breakdown',
  },
  { role: 'user', text: 'Build a funnel from pricing to checkout' },
  {
    role: 'assistant',
    text: '41% of pricing visitors start checkout; the drop is on the plan step.',
    chart: 'funnel',
  },
];

const THINKING_MS = 900;
const AFTER_USER_MS = 500;
const AFTER_ASSISTANT_MS = 2600;
const RESTART_MS = 5000;

// Messages slide up together as a new one arrives, like the real chat.
const ENTER_TRANSITION = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
} as const;
const INSTANT = { duration: 0 } as const;

const TREND = [96, 132, 148, 212, 240, 226, 230];
const BREAKDOWN = [
  { label: 'Google', value: 48 },
  { label: 'Product Hunt', value: 27 },
  { label: 'Direct', value: 17 },
  { label: 'X / Twitter', value: 8 },
];
const FUNNEL = [
  { label: 'Viewed pricing', value: 100, count: '3,120' },
  { label: 'Picked a plan', value: 58, count: '1,810' },
  { label: 'Started checkout', value: 41, count: '1,279' },
];

/** How many turns are on screen, and whether the assistant is "thinking" about the next one. */
function useScriptedReplay(length: number, reducedMotion: boolean) {
  const [shown, setShown] = useState(reducedMotion ? length : 1);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    if (shown >= length) {
      const restart = window.setTimeout(() => setShown(1), RESTART_MS);
      return () => window.clearTimeout(restart);
    }
    const next = SCRIPT[shown];
    const previous = SCRIPT[shown - 1];
    const timers: number[] = [];
    if (next?.role === 'assistant') {
      timers.push(window.setTimeout(() => setThinking(true), AFTER_USER_MS));
      timers.push(
        window.setTimeout(() => {
          setThinking(false);
          setShown((count) => count + 1);
        }, AFTER_USER_MS + THINKING_MS)
      );
    } else {
      timers.push(
        window.setTimeout(
          () => setShown((count) => count + 1),
          previous?.role === 'assistant' ? AFTER_ASSISTANT_MS : AFTER_USER_MS
        )
      );
    }
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [shown, length, reducedMotion]);

  return { shown, thinking };
}

export function ChatPreview({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion() ?? false;
  const { shown, thinking } = useScriptedReplay(SCRIPT.length, reducedMotion);
  const turns = SCRIPT.slice(0, shown);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex max-h-[38rem] flex-col overflow-hidden rounded-xl border bg-background shadow-sm',
        className
      )}
    >
      <LayoutGroup>
        <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden p-4 [mask-image:linear-gradient(to_bottom,transparent,black_3rem)]">
          <AnimatePresence initial={false}>
            {turns.map((turn, index) => (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className={
                  turn.role === 'user' ? 'flex justify-end' : 'col gap-2'
                }
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                initial={{ opacity: 0, y: 16 }}
                key={`${index}-${turn.text}`}
                layout="position"
                transition={reducedMotion ? INSTANT : ENTER_TRANSITION}
              >
                {turn.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground text-sm">
                    {turn.text}
                  </div>
                ) : (
                  <>
                    <p className="text-sm">{turn.text}</p>
                    {turn.chart && <ChartCard kind={turn.chart} />}
                  </>
                )}
              </motion.div>
            ))}
            {thinking && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="op-shimmer font-medium text-muted-foreground text-sm"
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                initial={{ opacity: 0, y: 8 }}
                key="thinking"
                layout="position"
                transition={reducedMotion ? INSTANT : ENTER_TRANSITION}
              >
                Thinking…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
      <div className="row m-3 mt-0 items-center gap-3 rounded-2xl border bg-card px-4 py-2.5">
        <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-muted-foreground/70 text-sm">
          Ask about your data, build a chart, or ask how something works…
        </span>
        <span className="center-center size-7 shrink-0 rounded-full bg-primary text-primary-foreground">
          <ArrowUpIcon className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function ChartCard({ kind }: { kind: ChartKind }) {
  const titles: Record<ChartKind, [string, string]> = {
    trend: ['Signups', 'Last 7 days, by day'],
    breakdown: ['Signups by referrer', 'Last 7 days'],
    funnel: ['Pricing to checkout', 'Last 30 days'],
  };
  const [title, subtitle] = titles[kind];
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="px-4 pt-3 pb-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-muted-foreground text-xs">{subtitle}</div>
      </div>
      <div className="px-4 pt-1 pb-4">
        {kind === 'trend' && <TrendChart />}
        {kind === 'breakdown' && <BreakdownChart />}
        {kind === 'funnel' && <FunnelChart />}
      </div>
    </div>
  );
}

const TREND_WIDTH = 300;
const TREND_HEIGHT = 72;

function TrendChart() {
  const max = Math.max(...TREND);
  const stepX = TREND_WIDTH / (TREND.length - 1);
  const points = TREND.map(
    (value, index) =>
      [
        index * stepX,
        TREND_HEIGHT - (value / max) * (TREND_HEIGHT - 8),
      ] as const
  );
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `0,${TREND_HEIGHT} ${line} ${TREND_WIDTH},${TREND_HEIGHT}`;
  return (
    <div className="col gap-2">
      <div className="row items-baseline gap-2">
        <span className="font-semibold text-xl tabular-nums">1,284</span>
        <span className="text-emerald-600 text-xs tabular-nums dark:text-emerald-400">
          +18%
        </span>
      </div>
      <svg
        className="h-[72px] w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      >
        <title>Signups trend</title>
        <polygon
          className="fill-chart-0/15"
          points={area}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="stroke-chart-0"
          fill="none"
          points={line}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function BreakdownChart() {
  return (
    <ul className="col gap-2">
      {BREAKDOWN.map((row) => (
        <li className="col gap-1" key={row.label}>
          <div className="row justify-between text-xs">
            <span>{row.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.value}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-def-200 dark:bg-def-300">
            <div
              className="h-full rounded-full bg-chart-0"
              style={{ width: `${row.value}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FunnelChart() {
  return (
    <ul className="col gap-2">
      {FUNNEL.map((step) => (
        <li className="col gap-1" key={step.label}>
          <div className="row justify-between text-xs">
            <span>{step.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {step.count} · {step.value}%
            </span>
          </div>
          <div className="h-2 rounded bg-def-200 dark:bg-def-300">
            <div
              className="h-full rounded bg-chart-0"
              style={{ width: `${step.value}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
