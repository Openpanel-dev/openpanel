import React from 'react';

type IllustrationProps = {
  className?: string;
};

export function DataOwnershipIllustration({
  className = '',
}: IllustrationProps) {
  return (
    <div>
      {/* Main layout */}
      <div className="relative grid aspect-2/1 grid-cols-5 gap-3">
        {/* Left: your server card */}
        <div
          className="
            col-span-3 rounded-2xl border border-border bg-card/80
            p-3 sm:p-4 shadow-xl backdrop-blur
            transition-all duration-300
            group-hover:-translate-y-1 group-hover:-translate-x-0.5
          "
        >
          <div className="flex items-center justify-between text-xs text-foreground">
            <span>Your server</span>
            <span className="flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              In control
            </span>
          </div>

          {/* "Server" visual */}
          <div className="mt-3 space-y-2">
            <div className="flex gap-1.5">
              <div className="flex-1 rounded-xl bg-card/80 border border-border px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Region</p>
                <p className="text-xs font-medium text-foreground">
                  EU / Custom
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-card/80 border border-border px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Retention</p>
                <p className="text-xs font-medium text-foreground">
                  Configurable
                </p>
              </div>
            </div>

            {/* mini "database"/requests strip */}
            <div className="mt-1 rounded-xl border border-border bg-card/90 px-3 py-2 text-[11px] text-foreground">
              <div className="flex items-center justify-between">
                <span>Events stored</span>
                <span className="text-[10px] text-muted-foreground">
                  locally
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/70" />
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/40" />
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/20" />
              </div>
            </div>
            <div className="mt-1 rounded-xl border border-border bg-card/90 px-3 py-2 text-[11px] text-foreground">
              <div className="flex items-center justify-between">
                <span>CPU</span>
                <span className="text-[10px] text-muted-foreground">20%</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/70" />
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/40" />
                <div className="h-1.5 flex-1 rounded-full bg-blue-400/20" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: third-party contrast */}
        <div
          className="
            col-span-2 rounded-2xl border border-border/80 bg-card/40
            p-3 text-[11px] text-muted-foreground
            transition-all duration-300
            group-hover:translate-y-1 group-hover:translate-x-0.5 group-hover:opacity-70
          "
        >
          <p className="text-xs text-muted-foreground mb-2">or use our cloud</p>

          <ul className="space-y-1.5">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Zero server setup
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Auto-scaling & backups
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              99.9% uptime
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              24/7 support
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Export data anytime
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
