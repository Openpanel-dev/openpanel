import { ArrowUpIcon, SparklesIcon } from 'lucide-react';
import { BrowserFrame } from './frame';
import { cn } from '@/lib/utils';

const ANSWER_ROWS = [
  { label: 'Product Hunt', value: 312, share: 100 },
  { label: 'Google', value: 198, share: 63 },
  { label: 'X', value: 84, share: 27 },
  { label: 'Hacker News', value: 51, share: 16 },
];

// The chat view, as it looks in Claude or Cursor once OpenPanel's MCP is connected.
export function ChatMock({
  className,
  client = 'Claude',
}: {
  className?: string;
  client?: string;
}) {
  return (
    <BrowserFrame
      className={cn('text-left', className)}
      host="claude.ai"
      url=""
    >
      <div className="col gap-5 bg-white p-6">
        <div className="self-end rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[13px]">
          Which referrer brought the most sign-ups last week, and which
          converted best?
        </div>
        <div className="col gap-3 text-[13px] leading-relaxed">
          <p>
            <strong>Product Hunt</strong> brought the most sign-ups last week
            with 312, ahead of Google (198) and X (84). Product Hunt also
            converted best: 9.4% of its visitors signed up, against 2.1% from
            Google.
          </p>
          <div className="col gap-1.5 rounded-lg border border-neutral-200 p-3">
            <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
              Sign-ups by referrer · Oct 20 to Oct 27
            </span>
            {ANSWER_ROWS.map((row) => (
              <div
                className="row relative items-center justify-between overflow-hidden rounded px-2 py-1 text-[12px]"
                key={row.label}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-blue-600/10"
                  style={{ width: `${row.share}%` }}
                />
                <span className="relative font-medium">{row.label}</span>
                <span className="relative font-mono text-neutral-600">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <p className="row items-center gap-1.5 text-[11px] text-neutral-500">
            <SparklesIcon className="size-3" />
            {client} · 3 OpenPanel tools called: get_top_referrers,
            get_page_conversions, get_funnel
          </p>
        </div>
        <div className="row items-center justify-between rounded-xl border border-neutral-200 px-4 py-2.5 text-[13px] text-neutral-400">
          Ask a follow-up…
          <span className="center-center size-6 rounded-full bg-neutral-900 text-white">
            <ArrowUpIcon className="size-3" />
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}
