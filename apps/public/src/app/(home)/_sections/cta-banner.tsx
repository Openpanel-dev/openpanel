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
      <section className="col center-center gap-6 rounded-3xl bg-foreground px-6 py-16 text-background md:px-16 md:py-20">
        <h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
          {title}
        </h2>
        <p className="max-w-md text-balance text-background/70">
          {description}
        </p>
        <div className="row mt-2 flex-wrap items-center justify-center gap-3">
          <GetStartedButton
            className="bg-background text-foreground hover:bg-background/90"
            href={ctaLink}
            text={ctaText}
          />
          <Button
            asChild
            className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
            size="lg"
            variant="outline"
          >
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
