import { cn } from '@/lib/utils';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  CookieIcon,
  CreditCardIcon,
  DatabaseIcon,
  DollarSignIcon,
  FlaskRoundIcon,
  GithubIcon,
  ServerIcon,
  StarIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Competition } from './competition';
import { HeroCarousel } from './hero-carousel';
import { HeroMap } from './hero-map';
import { Tag } from './tag';
import { Button } from './ui/button';

const perks = [
  { text: 'Free trial 30 days', icon: CalendarIcon },
  { text: 'No credit card required', icon: CreditCardIcon },
  { text: 'Cookie-less tracking', icon: CookieIcon },
  { text: 'Open-source', icon: GithubIcon },
  { text: 'Your data, your rules', icon: DatabaseIcon },
  { text: 'Self-hostable', icon: ServerIcon },
];

export function Hero() {
  return (
    <HeroContainer>
      <div className="container relative z-10 col sm:row sm:py-44 max-sm:pt-32">
        <div className="col gap-8 w-full sm:w-1/2 sm:pr-12">
          <div className="col gap-4">
            <Tag className="self-start">
              <StarIcon className="size-4 fill-yellow-500 text-yellow-500" />
              Trusted by +2000 projects
            </Tag>
            <h1
              className="text-4xl md:text-5xl font-extrabold leading-[1.1]"
              title="An open-source alternative to Mixpanel"
            >
              An open-source alternative to <Competition />
            </h1>
            <p className="text-xl text-muted-foreground">
              A web and product analytics platform that combines the power of
              Mixpanel with the ease of Plausible and one of the best Google
              Analytics replacements.
            </p>
          </div>
          <Button size="lg" asChild className="group w-72">
            <Link href="https://dashboard.openpanel.dev/onboarding">
              Get started now
              <ChevronRightIcon className="size-4 group-hover:translate-x-1 transition-transform group-hover:scale-125" />
            </Link>
          </Button>

          <ul className="grid grid-cols-2 gap-2">
            {perks.map((perk) => (
              <li key={perk.text} className="text-sm text-muted-foreground">
                <perk.icon className="size-4 inline-block mr-1" />
                {perk.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="col sm:w-1/2 relative group">
          <div
            className={cn([
              'overflow-hidden rounded-lg border border-border bg-background shadow-lg',
              'sm:absolute sm:left-0 sm:-top-12 sm:w-[800px] sm:-bottom-32',
              'max-sm:h-[800px] max-sm:-mx-4 max-sm:mt-12 relative',
            ])}
          >
            {/* Window controls */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50 h-12">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              {/* URL bar */}
              <a
                target="_blank"
                rel="noreferrer noopener nofollow"
                href="https://demo.openpanel.dev/demo/shoey"
                className="group flex-1 mx-4 px-3 py-1 text-sm bg-background rounded-md border border-border flex items-center gap-2"
              >
                <span className="text-muted-foreground flex-1">
                  https://demo.openpanel.dev
                </span>
                <ArrowRightIcon className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            </div>
            <iframe
              src={'https://demo.openpanel.dev/demo/shoey?range=lastHour'}
              className="w-full h-full"
              title="Live preview"
              scrolling="no"
            />
            <div className="pointer-events-none absolute inset-0 top-12 center-center group-hover:bg-foreground/20 transition-colors">
              <Button
                asChild
                className="group-hover:opacity-100 opacity-0 transition-opacity pointer-events-auto"
              >
                <Link
                  href="https://demo.openpanel.dev/demo/shoey"
                  rel="noreferrer noopener nofollow"
                  target="_blank"
                >
                  Test live demo
                  <FlaskRoundIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
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
      <div className={cn('relative z-10', className)}>{children}</div>

      {/* Shadow bottom */}
      <div className="w-full absolute bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
