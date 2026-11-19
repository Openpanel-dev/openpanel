import {
  ArrowUpIcon,
  ChevronDownIcon,
  MicIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RECENT_CHATS = [
  'Sign-ups by referrer last week',
  'Churn after the pricing change',
  'Which plan converts best?',
  'Weekly retention, Q3 cohorts',
  'Top pages for new visitors',
];

const ANSWER_ROWS = [
  { label: 'Product Hunt', value: 312, share: 100 },
  { label: 'Google', value: 198, share: 63 },
  { label: 'X', value: 84, share: 27 },
  { label: 'Hacker News', value: 51, share: 16 },
];

// A desktop AI client in light mode, answering from OpenPanel's MCP tools.
export function ChatMock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'window-shadow row overflow-hidden rounded-xl border border-black/8 bg-white text-left text-neutral-900',
        className
      )}
    >
      <aside className="col w-[200px] shrink-0 gap-4 border-neutral-200 border-r bg-neutral-50 p-3">
        <div className="row gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="row items-center gap-2 rounded-md bg-neutral-200/70 px-2.5 py-1.5 font-medium text-[12.5px]">
          <PlusIcon className="size-3.5" />
          New chat
        </div>
        <div className="col gap-0.5">
          <span className="row items-center justify-between px-2.5 pb-1 text-[11px] text-neutral-400">
            Recents
            <SearchIcon className="size-3" />
          </span>
          {RECENT_CHATS.map((chat, index) => (
            <span
              className={cn(
                'truncate rounded-md px-2.5 py-1.5 text-[12px]',
                index === 0
                  ? 'bg-neutral-200/70 text-neutral-900'
                  : 'text-neutral-600'
              )}
              key={chat}
            >
              {chat}
            </span>
          ))}
        </div>
      </aside>

      <div className="col min-w-0 flex-1 gap-5 p-6">
        <div className="max-w-[70%] self-end rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[13px]">
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
            <SparklesIcon className="size-3" />3 OpenPanel tools called:
            get_top_referrers, get_page_conversions, get_funnel
          </p>
        </div>
        <div className="col gap-2 rounded-2xl border border-neutral-200 px-4 py-3 shadow-sm">
          <span className="text-[13px] text-neutral-400">Ask a follow-up…</span>
          <div className="row items-center gap-3 text-[12px] text-neutral-500">
            <PlusIcon className="size-3.5" />
            <MicIcon className="size-3.5" />
            <span className="row items-center gap-1">
              Auto
              <ChevronDownIcon className="size-3" />
            </span>
            <span className="ml-auto">OpenPanel MCP · connected</span>
            <span className="center-center size-6 rounded-full bg-neutral-900 text-white">
              <ArrowUpIcon className="size-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PROMPTS = [
  'What changed this week compared to last week?',
  'Show me unique visitors per day for the last 30 days',
  'Build a dashboard for signups and where they come from',
  'How do I connect the MCP server to Claude?',
];

// The Chat page inside the dashboard: composer, default prompts, and an
// answer that asks for approval before it writes.
export function ChatInappContent() {
  return (
    <div className="col mx-auto w-full max-w-[640px] gap-4 py-2">
      <div className="col items-center gap-1 text-center">
        <span className="font-semibold text-[15px]">Ask about Acme SaaS</span>
        <span className="text-[12px] text-neutral-500">
          Answers come with the data behind them. Writes ask first.
        </span>
      </div>
      <div className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[13px]">
        Build a dashboard for signups and where they come from
      </div>
      <div className="col gap-3 text-[13px] leading-relaxed">
        <p>
          I will create a dashboard with four reports: sign-ups per day,
          sign-ups by referrer, sign-ups by UTM campaign, and a visit to sign-up
          conversion line.
        </p>
        <div className="col gap-3 rounded-lg border border-neutral-200 p-3">
          <div className="row items-center justify-between">
            <span className="col">
              <span className="font-medium text-[12.5px]">
                Create dashboard
              </span>
              <span className="text-[11px] text-neutral-500">
                "Signups" · 4 reports · Acme SaaS
              </span>
            </span>
            <span className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              needs approval
            </span>
          </div>
          <div className="row gap-2 text-[12px]">
            <span className="rounded-md bg-neutral-900 px-2.5 py-1 font-medium text-white">
              Approve
            </span>
            <span className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-700">
              Reject
            </span>
          </div>
        </div>
      </div>
      <div className="row flex-wrap gap-1.5">
        {DEFAULT_PROMPTS.map((prompt) => (
          <span
            className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600"
            key={prompt}
          >
            {prompt}
          </span>
        ))}
      </div>
      <div className="col gap-2 rounded-2xl border border-neutral-200 px-4 py-3 shadow-sm">
        <span className="text-[13px] text-neutral-400">
          Ask about your data, build a chart, or ask how something works…
        </span>
        <div className="row items-center gap-3 text-[12px] text-neutral-500">
          <PlusIcon className="size-3.5" />
          <span className="row items-center gap-1">
            GPT-6.1 Sol
            <ChevronDownIcon className="size-3" />
          </span>
          <span className="row items-center gap-1 text-neutral-400">
            <SparklesIcon className="size-3" />
            balanced
          </span>
          <span className="ml-auto">14 of 20 messages today</span>
          <span className="center-center size-6 rounded-full bg-neutral-900 text-white">
            <ArrowUpIcon className="size-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
