import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

function Svg({ className }: { className?: string }) {
  return (
    <svg
      width="409"
      height="539"
      viewBox="0 0 409 539"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-foreground', className)}
    >
      <path
        d="M222.146 483.444C332.361 429.581 378.043 296.569 324.18 186.354C270.317 76.1395 137.306 30.4572 27.0911 84.3201"
        stroke="url(#paint0_linear_552_3808)"
        strokeWidth="123.399"
      />
      <defs>
        <linearGradient
          id="paint0_linear_552_3808"
          x1="324.18"
          y1="186.354"
          x2="161.365"
          y2="265.924"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CtaBanner({
  title = (
    <>
      Ready to understand your users better?
      <br />
      Start tracking in minutes
    </>
  ),
  description = 'Join thousands of companies using OpenPanel. Free 30-day trial, no credit card required. Self-host for free or use our cloud.',
  ctaText,
  ctaLink,
}: {
  title?: string | React.ReactNode;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
}) {
  return (
    <div className="container">
      <section
        className={cn(
          'relative overflow-hidden border rounded-3xl py-16 px-4 md:px-16',
        )}
      >
        <div className="size-px absolute left-12 bottom-12 rounded-full shadow-[0_0_250px_80px_var(--color-foreground)]" />
        <div className="size-px absolute right-12 top-12 rounded-full shadow-[0_0_250px_80px_var(--color-foreground)]" />
        <Svg className="absolute left-0 bottom-0 -translate-x-1/2 translate-y-1/2 max-md:scale-50 opacity-50" />
        <Svg className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 rotate-105 max-md:scale-50 scale-75 opacity-50" />

        <div className="absolute inset-0 bg-linear-to-br from-foreground/5 via-transparent to-foreground/5" />
        <div className="container relative z-10 col gap-6 center-center max-w-3xl">
          <h2 className="text-4xl md:text-4xl font-semibold text-center">
            {title}
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            {description}
          </p>
          <GetStartedButton className="mt-4" text={ctaText} href={ctaLink} />
        </div>
      </section>
    </div>
  );
}
