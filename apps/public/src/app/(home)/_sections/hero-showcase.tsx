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
  },
  {
    id: 'product',
    label: 'Product analytics',
    render: () => <ProductAnalyticsMock />,
  },
  {
    id: 'ai',
    label: 'AI observability',
    render: () => <AiOverviewMock />,
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
                ? 'bg-neutral-100 text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-900'
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
          className="relative max-h-[680px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)] max-md:overflow-x-auto"
          key={active.id}
        >
          <div className="min-w-[960px]">{active.render()}</div>
        </div>
      </div>
    </div>
  );
}
