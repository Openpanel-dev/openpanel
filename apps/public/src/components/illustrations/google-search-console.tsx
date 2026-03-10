const queries = [
  {
    query: 'openpanel analytics',
    clicks: 312,
    impressions: '4.1k',
    pos: 1.2,
  },
  {
    query: 'open source mixpanel alternative',
    clicks: 187,
    impressions: '3.8k',
    pos: 2.4,
  },
  {
    query: 'web analytics without cookies',
    clicks: 98,
    impressions: '2.2k',
    pos: 4.7,
  },
];

export function GoogleSearchConsoleIllustration() {
  return (
    <div className="col h-full gap-2 px-4 pt-5 pb-3">
      {/* Top stats */}
      <div className="row mb-1 gap-2">
        <div className="col flex-1 gap-0.5 rounded-lg border bg-card px-2.5 py-2">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
            Clicks
          </span>
          <span className="font-bold font-mono text-sm">740</span>
        </div>
        <div className="col flex-1 gap-0.5 rounded-lg border bg-card px-2.5 py-2">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
            Impr.
          </span>
          <span className="font-bold font-mono text-sm">13k</span>
        </div>
        <div className="col flex-1 gap-0.5 rounded-lg border bg-card px-2.5 py-2">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
            Avg. CTR
          </span>
          <span className="font-bold font-mono text-sm">5.7%</span>
        </div>
        <div className="col flex-1 gap-0.5 rounded-lg border bg-card px-2.5 py-2">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
            Avg. Pos
          </span>
          <span className="font-bold font-mono text-sm">2.8</span>
        </div>
      </div>

      {/* Query table */}
      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <div className="row border-border border-b px-3 py-1.5">
          <span className="flex-1 text-[8px] text-muted-foreground uppercase tracking-wider">
            Query
          </span>
          <span className="w-10 text-right text-[8px] text-muted-foreground uppercase tracking-wider">
            Pos
          </span>
        </div>
        {queries.map((q, i) => (
          <div
            className="row items-center border-border/50 border-b px-3 py-1.5 last:border-0"
            key={q.query}
            style={{ opacity: 1 - i * 0.18 }}
          >
            <span className="flex-1 truncate text-[9px]">{q.query}</span>
            <span className="w-10 text-right font-mono text-[9px] text-muted-foreground">
              {q.pos}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
