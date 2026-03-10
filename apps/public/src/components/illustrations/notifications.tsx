import { CheckCircleIcon } from 'lucide-react';

export function NotificationsIllustration() {
  return (
    <div className="col h-full justify-center gap-3 px-6 py-4">
      {/* Funnel completion notification */}
      <div className="col gap-2 rounded-xl border border-border bg-card p-4 shadow-lg transition-transform duration-300 group-hover:-translate-y-0.5">
        <div className="row items-center gap-2">
          <CheckCircleIcon className="size-4 shrink-0 text-emerald-500" />
          <span className="font-semibold text-xs">Funnel completed</span>
          <span className="ml-auto text-[9px] text-muted-foreground">
            just now
          </span>
        </div>
        <p className="font-medium text-sm">Signup Flow — 142 today</p>
        <div className="row items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-emerald-500"
              style={{ width: '71%' }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">
            71% conversion
          </span>
        </div>
      </div>

      {/* Notification rule */}
      <div className="col gap-1.5 px-3 opacity-80">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
          Notification rule
        </span>
        <div className="row flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground">When</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
            Signup Flow
          </span>
          <span className="text-[9px] text-muted-foreground">completes →</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">
            #growth
          </span>
        </div>
      </div>
    </div>
  );
}
