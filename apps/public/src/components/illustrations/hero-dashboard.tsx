import { Bar, Sparkline, Stat } from './shared';

const VISITORS = [12, 18, 15, 22, 26, 24, 31, 29, 36, 42, 39, 48];

export function HeroDashboardIllustration() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-2xl border bg-background shadow-2xl shadow-black/10"
    >
      <div className="row items-center gap-2 border-b px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 rounded-md bg-muted px-3 py-1 text-muted-foreground text-xs">
          dashboard.openpanel.dev
        </span>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-[1fr_1fr_1fr]">
        <div className="bg-background p-5">
          <Stat change="+12%" label="Visitors" value="24,310" />
        </div>
        <div className="bg-background p-5">
          <Stat change="+8%" label="Sign-ups" value="1,208" />
        </div>
        <div className="bg-background p-5">
          <Stat change="-5%" label="AI cost" negative value="$42.10" />
        </div>
      </div>
      <div className="grid gap-px border-t bg-border md:grid-cols-[2fr_1fr]">
        <div className="col gap-3 bg-background p-5">
          <span className="text-muted-foreground text-sm">Last 30 days</span>
          <div className="h-40">
            <Sparkline points={VISITORS} />
          </div>
        </div>
        <div className="col gap-2 bg-background p-5">
          <span className="text-muted-foreground text-sm">Top referrers</span>
          <Bar label="google.com" share={100} value="9.1k" />
          <Bar label="producthunt.com" share={48} value="4.4k" />
          <Bar label="x.com" share={30} value="2.7k" />
          <Bar label="github.com" share={18} value="1.6k" />
        </div>
      </div>
    </div>
  );
}
