import React from 'react';

type IllustrationProps = {
  className?: string;
};

export function PrivacyIllustration({ className = '' }: IllustrationProps) {
  return (
    <div>
      {/* Floating cards */}
      <div className="relative aspect-3/2 md:aspect-2/1">
        {/* Back card */}
        <div
          className="
            absolute top-0 left-0 right-10 bottom-10 rounded-2xl border border-border/80 bg-card/70
            backdrop-blur-sm shadow-lg
            transition-all duration-300
            group-hover:-translate-y-1 group-hover:-rotate-2
          "
        >
          <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
            <span>Session duration</span>
            <span className="flex items-center gap-1">
              3m 12s
              <span className="text-[10px] text-blue-400">+8%</span>
            </span>
          </div>

          {/* Simple line chart */}
          <div className="mt-3 px-4">
            <svg
              viewBox="0 0 120 40"
              className="h-16 w-full text-muted-foreground"
            >
              <path
                d="M2 32 L22 18 L40 24 L60 10 L78 16 L96 8 L118 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="opacity-60"
              />
              <circle cx="118" cy="14" r="2.5" className="fill-blue-400" />
            </svg>
          </div>
        </div>

        {/* Front card */}
        <div
          className="
            col
            absolute top-10 left-4 right-0 bottom-0 rounded-2xl border border-border/80
            bg-card shadow-xl
            transition-all duration-300
            group-hover:translate-y-1 group-hover:rotate-2
          "
        >
          <div className="flex items-center justify-between px-4 pt-3 text-xs text-foreground">
            <span>Anonymous visitors</span>
            <span className="text-[10px] rounded-full bg-card px-2 py-0.5 text-muted-foreground">
              No cookies
            </span>
          </div>

          <div className="flex items-end justify-between px-4 pt-4 pb-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">
                Active now
              </p>
              <p className="text-2xl font-semibold text-foreground">128</p>
            </div>
            <div className="space-y-1.5 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span>IP + UA hashed daily</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span>No fingerprinting</span>
              </div>
            </div>
          </div>

          {/* "Sources" row */}
          <div className="mt-auto flex gap-2 border-t border-border px-3 py-2.5 text-[11px]">
            <div className="flex-1 rounded-xl bg-card/90 px-3 py-1.5 flex items-center justify-between">
              <span className="text-muted-foreground">Direct</span>
              <span className="text-foreground">42%</span>
            </div>
            <div className="flex-1 rounded-xl bg-card/90 px-3 py-1.5 flex items-center justify-between">
              <span className="text-muted-foreground">Organic</span>
              <span className="text-foreground">58%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
