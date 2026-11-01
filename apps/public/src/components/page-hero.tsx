import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const STAGGER_MS = 90;

function rise(step: number) {
  return { animationDelay: `${step * STAGGER_MS}ms` };
}

// The top of every marketing page: optional pill, headline, lede, actions.
// Everything rises in on load in the same rhythm as the homepage.
export function PageHero({
  pill,
  eyebrow,
  title,
  description,
  actions,
  align = 'center',
  className,
  children,
}: {
  pill?: { label: string; text: string; href: string };
  // Anything that should sit above the headline when it is not a pill
  // (the "OpenPanel vs X" lockup on compare pages).
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
  children?: React.ReactNode;
}) {
  const centered = align === 'center';
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(0,0,0,0.045),transparent_70%)]"
      />
      <div
        className={cn(
          'container relative pt-32 pb-12 md:pt-40 md:pb-16',
          className
        )}
      >
        <div
          className={cn(
            'col gap-6',
            centered ? 'items-center text-center' : 'items-start text-left'
          )}
        >
          {eyebrow && (
            <div className="animate-rise" style={rise(0)}>
              {eyebrow}
            </div>
          )}
          {pill && (
            <Link
              className="row animate-rise items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm shadow-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-50"
              href={pill.href}
              style={rise(0)}
            >
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-[11px] text-white">
                {pill.label}
              </span>
              <span className="text-neutral-600">{pill.text}</span>
              <ArrowRightIcon className="size-3.5 text-neutral-400" />
            </Link>
          )}
          <h1
            className="max-w-4xl animate-rise text-balance font-semibold text-4xl leading-[1.05] tracking-[-0.03em] md:text-6xl"
            style={rise(1)}
          >
            {title}
          </h1>
          {description && (
            <p
              className="max-w-2xl animate-rise text-balance text-lg text-neutral-600 md:text-xl"
              style={rise(2)}
            >
              {description}
            </p>
          )}
          {actions && (
            <div
              className={cn(
                'row animate-rise flex-wrap items-center gap-3',
                centered && 'justify-center'
              )}
              style={rise(3)}
            >
              {actions}
            </div>
          )}
        </div>
        {children && (
          <div className="mt-14 animate-rise md:mt-20" style={rise(4)}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
