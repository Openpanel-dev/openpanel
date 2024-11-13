import { cn } from '@/lib/utils';
import Link from 'next/link';
import { HeroCarousel } from './hero-carousel';
import { HeroMap } from './hero-map';
import { Button } from './ui/button';
import { WorldMap } from './world-map';

export function Hero() {
  return (
    <HeroContainer>
      {/* Shadow bottom */}
      <div className="w-full absolute bottom-0 h-32 bg-gradient-to-t from-background to-transparent z-20" />

      {/* Content */}
      <div className="container relative z-10">
        <div className="max-w-2xl col gap-4 pt-28 text-center mx-auto ">
          <h1 className="text-6xl font-bold leading-[1.1]">
            An open-source alternative to <span>Mixpanel</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </p>
        </div>

        {/* CTA */}
        <div className="row gap-4 center-center my-12">
          <Button size="lg" asChild>
            <Link href="https://dashboard.openpanel.dev/register">
              Try it for free
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Free for 30 days, no credit card required
          </p>
        </div>

        <HeroCarousel />
      </div>
    </HeroContainer>
  );
}

export function HeroContainer({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={cn('radial-gradient overflow-hidden relative')}>
      {/* Map */}
      <HeroMap />

      {/* Gradient over map */}
      <div className="absolute inset-0 radial-gradient-dot-1 select-none" />
      <div className="absolute inset-0 radial-gradient-dot-1 select-none" />

      <div className={cn('relative z-10', className)}>{children}</div>

      {/* Shadow bottom */}
      <div className="w-full absolute bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
