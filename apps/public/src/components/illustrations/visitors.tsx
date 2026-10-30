import { CookieIcon } from 'lucide-react';
import {
  Bar,
  IllustrationCard,
  IllustrationPanel,
  Sparkline,
  Stat,
} from './shared';

const VISITORS = [20, 26, 23, 31, 28, 35, 33, 41, 38, 46, 44, 52];

export function VisitorsIllustration() {
  return (
    <IllustrationPanel>
      <IllustrationCard className="max-w-md">
        <div className="row items-start justify-between">
          <Stat change="+23%" label="Visitors this week" value="8,420" />
          <span className="row items-center gap-1.5 rounded-full border px-2.5 py-1 text-muted-foreground text-xs">
            <CookieIcon className="size-3.5" />
            No cookies
          </span>
        </div>
        <div className="h-24">
          <Sparkline points={VISITORS} />
        </div>
        <div className="col gap-1">
          <span className="mb-1 text-muted-foreground text-sm">Top pages</span>
          <Bar label="/" share={100} value="3.2k" />
          <Bar label="/pricing" share={55} value="1.8k" />
          <Bar label="/docs" share={38} value="1.2k" />
        </div>
      </IllustrationCard>
    </IllustrationPanel>
  );
}
