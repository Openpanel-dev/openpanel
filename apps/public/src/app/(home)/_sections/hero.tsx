'use client';
import { Competition } from '@/components/competition';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { Tag } from '@/components/tag';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronRightIcon,
  CookieIcon,
  CreditCardIcon,
  DatabaseIcon,
  FlaskRoundIcon,
  GithubIcon,
  ServerIcon,
  StarIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

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
      initial={{ opacity: 0, scale: 0.9, x: 0 }}
      animate={
        isLoaded
          ? { opacity: 0.5, scale: 1, x: 0 }
          : { opacity: 0, scale: 0.9, x: 0 }
      }
      transition={{
        duration: 2,
      }}
      className={cn('absolute', className)}
      style={{
        left: `calc(50% - ${width / 2}px - 50px)`,
        top: -270,
      }}
    >
      <Image
        src="/hero-dark.webp"
        alt="Hero"
        width={width}
        height={height}
        className="hidden dark:block"
        style={{
          width,
          minWidth: width,
          height,
        }}
        onLoad={() => setIsLoaded(true)}
      />
      <Image
        src="/hero-light.webp"
        alt="Hero"
        width={width}
        height={height}
        className="dark:hidden"
        style={{
          width,
          minWidth: width,
          height,
        }}
        onLoad={() => setIsLoaded(true)}
      />
    </motion.div>
  );
}

export function Hero() {
  return (
    <HeroContainer className="-mb-32 max-sm:**:data-children:pb-0">
      <div className="col gap-8 w-full sm:w-1/2 sm:pr-12">
        <div className="col gap-4">
          {/* <div className="font-mono text-sm text-muted-foreground">
              TRUSTED BY 1,000+ COMPANIES • 4.7K GITHUB STARS
            </div> */}
          <h1 className="text-4xl md:text-5xl font-semibold leading-[1.1]">
            An open-source alternative to <Competition />
          </h1>
          <p className="text-lg text-muted-foreground">
            An open-source web and product analytics platform that combines the
            power of Mixpanel with the ease of Plausible and one of the best
            Google Analytics replacements.
          </p>
        </div>
        <div className="row gap-4">
          <GetStartedButton />
          <Button size="lg" variant="outline" asChild className="px-6">
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

      <div className="col sm:w-1/2 relative group max-sm:px-4">
        <div
          className={cn([
            'overflow-hidden rounded-lg border border-border bg-background shadow-lg',
            'sm:absolute sm:left-0 sm:-top-12 sm:w-[800px] sm:-bottom-64',
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
              className="group flex-1 mx-4 px-3 py-1 text-sm bg-background/20 rounded-md border border-border flex items-center gap-2"
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
        className="container relative col sm:row py-44 max-sm:pt-32"
        data-children
      >
        {children}
      </div>
      {divider && (
        <div className="absolute bottom-0 left-0 right-0 h-20 border-t border-border rounded-t-[3rem] md:rounded-t-[6rem] bg-background shadow-[0_0_100px_var(--background)]" />
      )}
    </section>
  );
}
