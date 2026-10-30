'use client';

import { useState } from 'react';
import { AiOverviewMock } from '@/components/dashboard-mock/ai-overview';
import { ProductAnalyticsMock } from '@/components/dashboard-mock/product-analytics';
import { WebOverviewMock } from '@/components/dashboard-mock/web-overview';
import { cn } from '@/lib/utils';

const VIEWS = [
  {
    id: 'web',
    label: 'Web analytics',
    render: () => <WebOverviewMock />,
    captions: [
      'Visitors, sessions and pageviews, with the previous period behind them.',
      'Every referrer, campaign and page, with the sessions it brought.',
      'Who is on the site right now, and what they are looking at.',
    ],
  },
  {
    id: 'product',
    label: 'Product analytics',
    render: () => <ProductAnalyticsMock />,
    captions: [
      'A funnel from any events, broken down by any property.',
      'Retention by sign-up week, so you see who actually comes back.',
      'Save it as a report, put it on a dashboard, share it with the team.',
    ],
  },
  {
    id: 'ai',
    label: 'AI observability',
    render: () => <AiOverviewMock />,
    captions: [
      'Cost, tokens, latency and error rate for every model your product calls.',
      'Each generation tied to the user and session that triggered it.',
      'Traces for multi-step agents, so a slow or expensive chain is easy to find.',
    ],
  },
] as const;

export function HeroShowcase() {
  const [activeId, setActiveId] = useState<(typeof VIEWS)[number]['id']>('web');
  const active = VIEWS.find((view) => view.id === activeId) ?? VIEWS[0];

  return (
    <div className="col gap-8">
      <div
        className="row mx-auto gap-1 rounded-full border border-black/8 bg-white p-1 shadow-sm"
        role="tablist"
      >
        {VIEWS.map((view) => (
          <button
            aria-selected={view.id === activeId}
            className={cn(
              'rounded-full px-4 py-2 font-medium text-sm transition-colors',
              view.id === activeId
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            )}
            key={view.id}
            onClick={() => setActiveId(view.id)}
            role="tab"
            type="button"
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(37,99,235,0.14),transparent_70%)]"
        />
        <div
          className="relative max-h-[680px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)] max-md:overflow-x-auto"
          key={active.id}
        >
          <div className="min-w-[960px]">{active.render()}</div>
        </div>
      </div>
      <ol className="grid grid-cols-1 gap-6 text-sm md:grid-cols-3">
        {active.captions.map((caption, index) => (
          <li className="row items-start gap-3" key={caption}>
            <span className="center-center size-5 shrink-0 rounded-full bg-neutral-900 font-mono text-[10px] text-white">
              {index + 1}
            </span>
            <span className="text-neutral-600">{caption}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
