'use client';

import { useState } from 'react';
import { VisualMock } from '@/components/visual-mock';
import { cn } from '@/lib/utils';

const VIEWS = [
  {
    id: 'web',
    label: 'Web analytics',
    dot: 'bg-blue-600',
    render: () => <VisualMock name="web-overview" />,
  },
  {
    id: 'product',
    label: 'Product analytics',
    dot: 'bg-emerald-600',
    render: () => <VisualMock name="product" />,
  },
  {
    id: 'ai',
    label: 'AI observability',
    dot: 'bg-violet-600',
    render: () => <VisualMock name="ai" />,
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
              'row items-center gap-2 rounded-full py-2 pr-4 pl-3 font-medium text-sm transition-colors',
              view.id === activeId
                ? 'bg-neutral-100 text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-900'
            )}
            key={view.id}
            onClick={() => setActiveId(view.id)}
            role="tab"
            type="button"
          >
            <span
              className={cn(
                'size-2 rounded-full transition-opacity',
                view.dot,
                view.id === activeId ? 'opacity-100' : 'opacity-40'
              )}
            />
            {view.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div className="relative max-h-[680px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)] max-md:overflow-x-auto">
          <div className="min-w-[960px] animate-rise" key={active.id}>
            {active.render()}
          </div>
        </div>
      </div>
    </div>
  );
}
