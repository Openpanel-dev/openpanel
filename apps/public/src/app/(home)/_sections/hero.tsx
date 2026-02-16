'use client';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CalendarIcon,
  CookieIcon,
  CreditCardIcon,
  DatabaseIcon,
  GithubIcon,
  ServerIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Competition } from '@/components/competition';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const perks = [
  { text: 'Free trial 30 days', icon: CalendarIcon },
  { text: 'No credit card required', icon: CreditCardIcon },
  { text: 'Cookie-less tracking', icon: CookieIcon },
  { text: 'Open-source', icon: GithubIcon },
  { text: 'Your data, your rules', icon: DatabaseIcon },
  { text: 'Self-hostable', icon: ServerIcon },
];

const aspectRatio = 2946 / 1329;
const width = 2346;
const height = width / aspectRatio;

function HeroImage({ className }: { className?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <motion.div
      animate={
        isLoaded
          ? { opacity: 0.5, scale: 1, x: 0 }
          : { opacity: 0, scale: 0.9, x: 0 }
      }
      className={cn('absolute', className)}
      initial={{ opacity: 0, scale: 0.9, x: 0 }}
      style={{
        left: `calc(50% - ${width / 2}px - 50px)`,
        top: -270,
      }}
      transition={{
        duration: 2,
      }}
    >
      <Image
        alt="Hero"
        className="hidden dark:block"
        height={height}
        onLoad={() => setIsLoaded(true)}
        src="/hero-dark.webp"
        style={{
          width,
          minWidth: width,
          height,
        }}
        width={width}
      />
      <Image
        alt="Hero"
        className="dark:hidden"
        height={height}
        onLoad={() => setIsLoaded(true)}
        src="/hero-light.webp"
        style={{
          width,
          minWidth: width,
          height,
        }}
        width={width}
      />
    </motion.div>
  );
}

export function Hero() {
  return (
    <HeroContainer className="-mb-32 max-sm:**:data-children:pb-0">
      <div className="col w-full gap-8 sm:w-1/2 sm:pr-12">
        <div className="col gap-4">
          <div className="font-mono text-muted-foreground text-sm">
            TRUSTED BY 1,000+ PROJECTS
          </div>
          <h1 className="font-semibold text-4xl leading-[1.1] md:text-5xl">
            OpenPanel - The open-source alternative to <Competition />
          </h1>
          <p className="text-lg text-muted-foreground">
            An open-source web and product analytics platform that combines the
            power of Mixpanel with the ease of Plausible and one of the best
            Google Analytics replacements.
          </p>
        </div>
        <div className="row gap-4">
          <GetStartedButton />
          <Button asChild className="px-6" size="lg" variant="outline">
            <Link
              href="https://demo.openpanel.dev/demo/shoey"
              rel="noreferrer noopener nofollow"
              target="_blank"
            >
              Test live demo
            </Link>
          </Button>
        </div>

        <Perks perks={perks} />
      </div>

      <div className="col group relative max-sm:px-4 sm:w-1/2">
        <div
          className={cn([
            'overflow-hidden rounded-lg border border-border bg-background shadow-lg',
            'sm:absolute sm:-top-12 sm:-bottom-64 sm:left-0 sm:w-[800px]',
            'relative max-sm:-mx-4 max-sm:mt-12 max-sm:h-[800px]',
          ])}
        >
          {/* Window controls */}
          <div className="flex h-12 items-center gap-2 border-border border-b bg-muted/50 px-4 py-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <div className="h-3 w-3 rounded-full bg-green-500" />
            </div>
            {/* URL bar */}
            <a
              className="group mx-4 flex flex-1 items-center gap-2 rounded-md border border-border bg-background/20 px-3 py-1 text-sm"
              href="https://demo.openpanel.dev/demo/shoey"
              rel="noreferrer noopener nofollow"
              target="_blank"
            >
              <span className="flex-1 text-muted-foreground">
                https://demo.openpanel.dev
              </span>
              <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </div>
          <iframe
            className="h-full w-full"
            scrolling="no"
            src={'https://demo.openpanel.dev/demo/shoey?range=lastHour'}
            title="Live preview"
          />
        </div>
      </div>
    </HeroContainer>
  );
}

export function HeroContainer({
  children,
  className,
  divider = true,
}: {
  children?: React.ReactNode;
  className?: string;
  divider?: boolean;
}): React.ReactElement {
  return (
    <section
      className={cn('relative z-10', divider && 'overflow-hidden', className)}
    >
      <div className="absolute inset-0 w-screen overflow-x-clip">
        <HeroImage />
      </div>
      <div
        className="col sm:row container relative py-44 max-sm:pt-32"
        data-children
      >
        {children}
      </div>
      {divider && (
        <div className="absolute right-0 bottom-0 left-0 h-20 rounded-t-[3rem] border-border border-t bg-background shadow-[0_0_100px_var(--background)] md:rounded-t-[6rem]" />
      )}
    </section>
  );
}
