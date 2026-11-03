import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Image from 'next/image';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

const LOGO_DIR = '/logos/compare';

// Logos that already spell the name, so no text is drawn next to them.
const WORDMARKS = new Set([
  'amplitude',
  'appsflyer',
  'countly',
  'fullstory',
  'funnelio',
  'heap',
  'mouseflow',
  'smartlook',
]);

const MARK_HEIGHT = { sm: 18, md: 24 } as const;

export function competitorLogoPath(competitorSlug: string) {
  const path = `${LOGO_DIR}/${competitorSlug}.svg`;
  return existsSync(join(process.cwd(), 'public', path)) ? path : null;
}

// The competitor's mark (a monochrome SVG when we have one) with its name.
export function CompetitorMark({
  name,
  slug,
  size = 'md',
  className,
}: {
  name: string;
  slug: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const logo = competitorLogoPath(slug);
  const height = MARK_HEIGHT[size];
  const isWordmark = logo !== null && WORDMARKS.has(slug);
  return (
    <span className={cn('row items-center gap-2', className)}>
      {logo && (
        // Brand colours are flattened to black so every mark reads the same.
        <Image
          alt={isWordmark ? name : ''}
          className="w-auto shrink-0 brightness-0"
          height={height}
          src={logo}
          style={{
            height,
            width: 'auto',
            maxWidth: isWordmark ? height * 5.5 : height,
          }}
          unoptimized
          width={height}
        />
      )}
      {!isWordmark && (
        <span
          className={cn(
            'font-semibold tracking-[-0.01em]',
            size === 'sm' ? 'text-sm' : 'text-lg'
          )}
        >
          {name}
        </span>
      )}
    </span>
  );
}

// "OpenPanel vs X" as a lockup above the headline.
export function VersusMark({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="row items-center gap-4 rounded-full bg-white py-2 pr-5 pl-3 shadow-sm ring-1 ring-black/6">
      <span className="row items-center gap-2">
        <span className="center-center size-7 rounded-lg bg-blue-600">
          <Logo className="h-3 w-auto text-white" />
        </span>
        <span className="font-semibold text-lg tracking-[-0.01em]">
          OpenPanel
        </span>
      </span>
      <span className="font-mono text-neutral-400 text-xs uppercase">vs</span>
      <CompetitorMark name={name} slug={slug} />
    </div>
  );
}
