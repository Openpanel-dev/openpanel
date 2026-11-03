import Link from 'next/link';
import { Band } from '@/components/band';
import { type CodeLine, CodeSnippet } from '@/components/blocks/code-snippet';
import { GetStartedButton } from '@/components/get-started-button';
import { GrowthLine } from '@/components/growth-line';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';

const SDK_TABS = [
  'Web',
  'Script tag',
  'React',
  'Next.js',
  'Vue',
  'React Native',
  'iOS',
];

const SNIPPET_LINES: CodeLine[] = [
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

export function CtaBanner({
  title = 'Start understanding your users today',
  description = 'One script on your site, or one SDK call in your app, and the first events show up within a minute. 30-day free trial, no credit card.',
  ctaText,
  ctaLink,
  secondary = { href: '/pricing', text: 'See pricing' },
  footnote = true,
}: {
  title?: string | React.ReactNode;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
  secondary?: { href: string; text: string };
  footnote?: boolean;
}) {
  return (
    <Band
      backdrop={
        <GrowthLine className="absolute inset-x-0 bottom-0 h-[62%] w-full" />
      }
      className="overflow-hidden"
      innerClassName="pointer-events-none grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16"
      tone="fade"
    >
      <div className="col pointer-events-auto gap-6">
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          {title}
        </h2>
        <p className="text-lg text-neutral-600">{description}</p>
        <div className="row flex-wrap items-center gap-3">
          <GetStartedButton href={ctaLink} text={ctaText} />
          <Button asChild className="px-6" size="lg" variant="outline">
            <Link href={secondary.href}>{secondary.text}</Link>
          </Button>
        </div>
        {footnote && (
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
        )}
      </div>
      <Reveal delay={120}>
        <CodeSnippet lines={SNIPPET_LINES} tabs={SDK_TABS} />
      </Reveal>
    </Band>
  );
}
