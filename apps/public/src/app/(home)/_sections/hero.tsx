import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { HeroShowcase } from './hero-showcase';
import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STAGGER_MS = 90;

function rise(step: number) {
  return { animationDelay: `${step * STAGGER_MS}ms` };
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(0,0,0,0.045),transparent_70%)]"
      />
      <div className="container relative pt-32 md:pt-40">
        <div className="col items-center gap-6 text-center">
          <Link
            className="row animate-rise items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm shadow-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-50"
            href="/docs/ai-observability"
            style={rise(0)}
          >
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-[11px] text-white">
              New
            </span>
            <span className="text-neutral-600">
              AI observability: cost and traces for every model call
            </span>
            <ArrowRightIcon className="size-3.5 text-neutral-400" />
          </Link>
          <h1
            className="max-w-4xl animate-rise text-balance font-semibold text-5xl leading-[1.02] tracking-[-0.03em] md:text-7xl"
            style={rise(1)}
          >
            One place for your <span className="text-blue-600">web</span>,{' '}
            <span className="text-emerald-600">product</span> and{' '}
            <span className="text-violet-600">AI</span> analytics
          </h1>
          <p
            className="max-w-2xl animate-rise text-balance text-lg text-neutral-600 md:text-xl"
            style={rise(2)}
          >
            See what people do on your site and in your product, what your AI
            calls cost, and ask the questions in plain English. The open-source
            Mixpanel alternative, cookie-less, in our EU cloud or on your own
            servers.
          </p>
          <div
            className="row animate-rise flex-wrap items-center justify-center gap-3"
            style={rise(3)}
          >
            <GetStartedButton />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="/docs/self-hosting/self-hosting">
                Self-host for free
              </Link>
            </Button>
          </div>
          <p className="animate-rise text-neutral-500 text-sm" style={rise(4)}>
            30-day free trial. No credit card.
          </p>
        </div>
      </div>
      <div
        className="mx-auto mt-14 max-w-6xl animate-rise px-4 md:mt-20"
        style={rise(5)}
      >
        <HeroShowcase />
      </div>
    </section>
  );
}

// Shared by every page hero so the top of the site feels the same everywhere.
export function HeroContainer({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
  divider?: boolean;
}): React.ReactElement {
  return (
    <section className="relative">
      <div
        className={cn(
          'container relative pt-32 pb-12 md:pt-44 md:pb-20',
          className
        )}
        data-children
      >
        {children}
      </div>
    </section>
  );
}
