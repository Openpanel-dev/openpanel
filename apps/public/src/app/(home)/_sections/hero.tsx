import Link from 'next/link';
import { GetStartedButton } from '@/components/get-started-button';
import { HeroDashboardIllustration } from '@/components/illustrations/hero-dashboard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Hero() {
  return (
    <HeroContainer className="pb-0">
      <div className="col items-center gap-6 text-center">
        <p className="font-medium text-muted-foreground text-sm">
          The open-source Mixpanel alternative
        </p>
        <h1 className="max-w-3xl font-semibold text-4xl leading-[1.05] tracking-tight md:text-6xl">
          Analytics for your product, your website and your AI
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
          See what your users do, what your AI spends, and ask your own AI for
          the numbers. Open source, cookie-less, and hosted in the EU or on your
          own servers.
        </p>
        <div className="row flex-wrap items-center justify-center gap-3">
          <GetStartedButton />
          <Button asChild className="px-6" size="lg" variant="outline">
            <Link href="/docs/self-hosting/self-hosting">
              Self-host for free
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          30-day free trial. No credit card.
        </p>
      </div>
      <div className="mt-16 md:mt-20">
        <HeroDashboardIllustration />
      </div>
    </HeroContainer>
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
