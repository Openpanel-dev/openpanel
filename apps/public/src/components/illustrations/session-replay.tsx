import { PlayIcon } from 'lucide-react';

export function SessionReplayIllustration() {
  return (
    <div className="session-replay-illustration h-full px-6 pb-3 pt-4">
      <div className="col h-full overflow-hidden rounded-xl border border-border bg-background shadow-lg transition-transform duration-300 group-hover:-translate-y-0.5">
        {/* Browser chrome */}
        <div className="row shrink-0 items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-red-400" />
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <div className="h-2 w-2 rounded-full bg-green-400" />
          <div className="mx-2 flex-1 rounded bg-background/80 px-2 py-0.5 text-[8px] text-muted-foreground">
            app.example.com/pricing
          </div>
        </div>

        {/* Page content */}
        <div className="relative flex-1 overflow-hidden p-3">
          <div className="mb-2 h-2 w-20 rounded-full bg-muted/60" />
          <div className="mb-4 h-2 w-32 rounded-full bg-muted/40" />
          <div className="row mb-3 gap-2">
            <div className="h-10 flex-1 rounded-lg border border-border bg-muted/20" />
            <div className="h-10 flex-1 rounded-lg border border-border bg-muted/20" />
          </div>
          <div className="mb-2 h-2 w-28 rounded-full bg-muted/30" />
          <div className="h-2 w-24 rounded-full bg-muted/20" />

          {/* Click heatspot */}
          <div
            className="absolute"
            style={{ left: '62%', top: '48%' }}
          >
            <div className="h-4 w-4 animate-pulse rounded-full border-2 border-blue-500/70 bg-blue-500/20" />
          </div>
          <div
            className="absolute"
            style={{ left: '25%', top: '32%' }}
          >
            <div className="h-2.5 w-2.5 rounded-full border border-blue-500/40 bg-blue-500/25" />
          </div>

          {/* Cursor trail */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ overflow: 'visible' }}
          >
            <path
              d="M 18% 22% Q 42% 28% 62% 48%"
              fill="none"
              stroke="rgb(59 130 246 / 0.35)"
              strokeDasharray="3 2"
              strokeWidth="1"
            />
          </svg>

          {/* Cursor */}
          <div
            className="cursor-animated absolute"
            style={{
              left: 'calc(18% + 8px)',
              top: 'calc(22% + 6px)',
              animation: 'cursor-trail 4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}
          >
            <svg fill="none" height="12" viewBox="0 0 10 12" width="10">
              <path
                d="M0 0L0 10L3 7L5 11L6.5 10.5L4.5 6.5L8 6L0 0Z"
                fill="var(--foreground)"
              />
            </svg>
          </div>
          <style>{`
            @keyframes cursor-trail {
              0%   { left: calc(18% + 8px); top: calc(22% + 6px); }
              55%  { left: calc(62% + 8px); top: calc(48% + 6px); }
              75%  { left: calc(62% + 8px); top: calc(48% + 6px); }
              100% { left: calc(18% + 8px); top: calc(22% + 6px); }
            }
            .session-replay-illustration .cursor-animated {
              animation-play-state: paused;
            }
            .session-replay-illustration:hover .cursor-animated {
              animation-play-state: running;
            }
          `}</style>
        </div>

        {/* Playback bar */}
        <div className="row shrink-0 items-center gap-2 border-t border-border bg-muted/20 px-3 py-2">
          <PlayIcon className="size-3 shrink-0 text-muted-foreground" />
          <div className="relative flex-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-1 rounded-full bg-blue-500"
              style={{ width: '42%' }}
            />
          </div>
          <span className="font-mono text-[8px] text-muted-foreground">
            0:52 / 2:05
          </span>
        </div>
      </div>
    </div>
  );
}
