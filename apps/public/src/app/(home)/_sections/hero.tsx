import Link from 'next/link';
import { HeroShowcase } from './hero-showcase';
import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container pt-32 md:pt-40">
        <div className="col items-center gap-6 text-center">
          <p className="font-medium text-neutral-500 text-sm">
            The open-source Mixpanel alternative
          </p>
          <h1 className="max-w-4xl text-balance font-semibold text-5xl leading-[1.02] tracking-[-0.03em] md:text-7xl">
            One place for your web, product and AI analytics
          </h1>
          <p className="max-w-2xl text-balance text-lg text-neutral-600 md:text-xl">
            See what people do on your site and in your product, what your AI
            calls cost, and ask the questions in plain English. Open source,
            cookie-less, in our EU cloud or on your own servers.
          </p>
          <div className="row flex-wrap items-center justify-center gap-3">
            <GetStartedButton />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="/docs/self-hosting/self-hosting">
                Self-host for free
              </Link>
            </Button>
          </div>
          <p className="text-neutral-500 text-sm">
            30-day free trial. No credit card.
          </p>
        </div>
      </div>
      <div className="mx-auto mt-14 max-w-6xl px-4 md:mt-20">
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
