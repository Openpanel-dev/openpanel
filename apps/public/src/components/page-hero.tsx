import { HeroPill, type HeroPillProps } from './hero-pill';
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
  pill?: Pick<HeroPillProps, 'label' | 'text' | 'shortText' | 'href'>;
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
            <HeroPill {...pill} className="animate-rise" style={rise(0)} />
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
