import { ChevronRightIcon, RouteIcon } from 'lucide-react';
import type { SessionPageVisit } from './session-pages';
import { WidgetHead, WidgetTitle } from '@/components/overview/overview-widget';
import { Widget } from '@/components/widget';
import { fancyMinutes } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';

const MS_PER_SECOND = 1000;
const MIN_BAR_PERCENT = 4;

function StepBadge({ label, tone }: { label: string; tone: 'entry' | 'exit' }) {
  return (
    <span
      className={cn(
        'rounded px-1 py-px font-semibold text-[10px] uppercase tracking-wider',
        tone === 'entry'
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
      )}
    >
      {label}
    </span>
  );
}

export function SessionJourney({ visits }: { visits: SessionPageVisit[] }) {
  const pages = visits.filter((visit) => visit.view !== null);
  if (pages.length === 0) {
    return null;
  }
  const longest = Math.max(...pages.map((page) => page.durationMs), 1);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={RouteIcon}>Journey</WidgetTitle>
      </WidgetHead>
      <ol className="row items-stretch overflow-x-auto p-4">
        {pages.map((page, index) => {
          const isFirst = index === 0;
          const isLast = index === pages.length - 1;
          const customEvents = page.events.length;
          const barWidth = Math.max(
            MIN_BAR_PERCENT,
            (page.durationMs / longest) * 100
          );
          return (
            <li
              className="row shrink-0 items-center"
              key={page.view?.id ?? index}
            >
              <div className="col w-36 gap-1.5 rounded-lg border bg-def-100 px-3 py-2.5 transition-colors hover:border-def-400">
                <div className="row items-center gap-1.5">
                  <span className="font-mono text-2xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  {isFirst && <StepBadge label="Entry" tone="entry" />}
                  {isLast && <StepBadge label="Exit" tone="exit" />}
                </div>
                <span
                  className="truncate font-medium text-sm"
                  title={page.path}
                >
                  {page.path}
                </span>
                <div className="h-1 overflow-hidden rounded-full bg-def-200">
                  <div
                    className="h-full rounded-full bg-highlight"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  {fancyMinutes(page.durationMs / MS_PER_SECOND)}
                  {customEvents > 0 &&
                    ` · ${customEvents} ${customEvents === 1 ? 'event' : 'events'}`}
                </span>
              </div>
              {!isLast && (
                <ChevronRightIcon className="mx-1 size-4 shrink-0 text-def-400" />
              )}
            </li>
          );
        })}
      </ol>
    </Widget>
  );
}
