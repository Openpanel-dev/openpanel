import { GetStartedButton } from '@/components/get-started-button';
import { cn } from '@/lib/utils';

function Svg({ className }: { className?: string }) {
  return (
    <svg
      className={cn('text-foreground', className)}
      fill="none"
      height="539"
      viewBox="0 0 409 539"
      width="409"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M222.146 483.444C332.361 429.581 378.043 296.569 324.18 186.354C270.317 76.1395 137.306 30.4572 27.0911 84.3201"
        stroke="url(#paint0_linear_552_3808)"
        strokeWidth="123.399"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="paint0_linear_552_3808"
          x1="324.18"
          x2="161.365"
          y1="186.354"
          y2="265.924"
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
          'relative overflow-hidden rounded-3xl border px-4 py-16 md:px-16'
        )}
      >
        <div className="absolute bottom-12 left-12 size-px rounded-full shadow-[0_0_250px_80px_var(--color-foreground)]" />
        <div className="absolute top-12 right-12 size-px rounded-full shadow-[0_0_250px_80px_var(--color-foreground)]" />
        <Svg className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 opacity-50 max-md:scale-50" />
        <Svg className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 rotate-105 scale-75 opacity-50 max-md:scale-50" />

        <div className="absolute inset-0 bg-linear-to-br from-foreground/5 via-transparent to-foreground/5" />
        <div className="col center-center container relative z-10 max-w-3xl gap-6">
          <h2 className="text-center font-semibold text-4xl md:text-4xl">
            {title}
          </h2>
          <p className="max-w-md text-center text-muted-foreground">
            {description}
          </p>
          <GetStartedButton className="mt-4" href={ctaLink} text={ctaText} />
        </div>
      </section>
    </div>
  );
}
