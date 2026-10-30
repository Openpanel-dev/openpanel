import Link from 'next/link';
import { GetStartedButton } from '@/components/get-started-button';
import { GrowthLine } from '@/components/growth-line';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SNIPPET_LINES: { text: string; tone?: 'muted' | 'string' }[] = [
  { text: 'npm install @openpanel/web', tone: 'muted' },
  { text: '' },
  { text: "import { OpenPanel } from '@openpanel/web';" },
  { text: '' },
  { text: 'const op = new OpenPanel({' },
  { text: "  clientId: 'YOUR_CLIENT_ID',", tone: 'string' },
  { text: '  trackScreenViews: true,' },
  { text: '  trackOutgoingLinks: true,' },
  { text: '});' },
];

function InstallSnippet() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-2xl bg-neutral-900 text-neutral-200 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className="row items-center gap-4 border-white/10 border-b px-5 py-3 text-[12px]">
        <span className="font-medium text-white">Web</span>
        <span className="text-neutral-500">Script tag</span>
        <span className="text-neutral-500">React</span>
        <span className="text-neutral-500">Next.js</span>
        <span className="text-neutral-500">Vue</span>
        <span className="text-neutral-500">React Native</span>
        <span className="text-neutral-500">iOS</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
        {SNIPPET_LINES.map((line, index) => (
          <div
            className={cn(
              line.tone === 'string' && 'text-emerald-300',
              line.tone === 'muted' && 'text-neutral-500'
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: static lines, some of them blank
            key={index}
          >
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function CtaBanner({
  title = 'Start understanding your users today',
  description = 'One script on your site, or one SDK call in your app, and the first events show up within a minute. 30-day free trial, no credit card.',
  ctaText,
  ctaLink,
}: {
  title?: string | React.ReactNode;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-canvas to-stone-200/70 py-20 md:py-28">
      <GrowthLine className="absolute inset-x-0 bottom-0 h-[62%] w-full" />
      <div className="container pointer-events-none relative grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
        <div className="col pointer-events-auto gap-6">
          <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
            {title}
          </h2>
          <p className="text-lg text-neutral-600">{description}</p>
          <div className="row flex-wrap items-center gap-3">
            <GetStartedButton href={ctaLink} text={ctaText} />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="text-neutral-500 text-sm">
            Cloud from $2.50 a month, or{' '}
            <Link
              className="font-medium text-neutral-900 underline-offset-4 hover:underline"
              href="/docs/self-hosting/self-hosting"
            >
              self-host for free
            </Link>
            .
          </p>
        </div>
        <Reveal delay={120}>
          <InstallSnippet />
        </Reveal>
      </div>
    </section>
  );
}
