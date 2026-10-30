'use client';

import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { MORE_FEATURES } from '@/lib/nav';

const SCROLL_STEP_PX = 560;

export function MoreFeatures() {
  const scrollerRef = useRef<HTMLUListElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({
      left: direction * SCROLL_STEP_PX,
      behavior: 'smooth',
    });
  };

  return (
    <section className="col gap-10 py-16 md:py-24">
      <div className="row container items-end justify-between gap-6">
        <SectionHeader
          description="Everything in one place, with no limit on sites, users, dashboards or charts."
          title="And everything around it"
          variant="sm"
        />
        <div className="row shrink-0 gap-2 max-md:hidden">
          <Button
            aria-label="Scroll features left"
            onClick={() => scrollBy(-1)}
            size="icon"
            variant="outline"
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            aria-label="Scroll features right"
            onClick={() => scrollBy(1)}
            size="icon"
            variant="outline"
          >
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
      <ul
        className="scrollbar-hidden row snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1rem,calc(50vw-500px+1rem))] pb-2"
        ref={scrollerRef}
      >
        {MORE_FEATURES.map((feature) => (
          <li className="w-64 shrink-0 snap-start" key={feature.href}>
            <Link
              className="col h-full gap-4 rounded-2xl border p-6 transition-colors hover:bg-muted/50"
              href={feature.href}
            >
              <span className="center-center size-10 rounded-xl bg-muted">
                <feature.icon className="size-5" />
              </span>
              <span className="col gap-1">
                <span className="font-medium">{feature.title}</span>
                <span className="text-muted-foreground text-sm">
                  {feature.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
        <li className="w-64 shrink-0 snap-start">
          <Link
            className="col h-full justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors hover:bg-muted/50"
            href="/features"
          >
            <span className="font-medium">All features</span>
            <span className="text-muted-foreground text-sm">
              SDKs, API, exports and more
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
