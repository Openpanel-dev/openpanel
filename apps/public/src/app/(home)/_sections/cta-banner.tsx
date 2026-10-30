import Link from 'next/link';
import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';

export function CtaBanner({
  title = 'Start understanding your users today',
  description = '30-day free trial, no credit card. Cloud from $2.50 a month, or self-host for free.',
  ctaText,
  ctaLink,
}: {
  title?: string | React.ReactNode;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
}) {
  return (
    <div className="container py-16 md:py-24">
      <section className="col center-center gap-6 rounded-3xl bg-white px-6 py-16 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-24px_rgba(0,0,0,0.16)] ring-1 ring-black/4 md:px-16 md:py-20">
        <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
          {title}
        </h2>
        <p className="max-w-md text-balance text-neutral-600">{description}</p>
        <div className="row mt-2 flex-wrap items-center justify-center gap-3">
          <GetStartedButton href={ctaLink} text={ctaText} />
          <Button asChild className="px-6" size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
