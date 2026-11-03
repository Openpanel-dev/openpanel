import Link from 'next/link';
import { GetStartedButton } from '@/components/get-started-button';
import { PageHero } from '@/components/page-hero';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const VISUAL_RISE_DELAY_MS = 360;

// Top of a feature page: PageHero with the replica of that feature under it.
// `visual` is usually <VisualMock name="…" />; `wide` lets a dashboard
// window run to 1152 px like the homepage, `fade` masks the bottom edge so
// a tall window can be cut off without a hard line.
export function FeatureHero({
  title,
  description,
  pill,
  eyebrow,
  visual,
  wide = true,
  fade = true,
  demoHref = 'https://demo.openpanel.dev',
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  pill?: { label: string; text: string; href: string };
  eyebrow?: React.ReactNode;
  visual?: React.ReactNode;
  wide?: boolean;
  fade?: boolean;
  demoHref?: string;
}) {
  return (
    <>
      <PageHero
        actions={
          <>
            <GetStartedButton />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link
                href={demoHref}
                rel="noreferrer noopener nofollow"
                target="_blank"
              >
                See live demo
              </Link>
            </Button>
          </>
        }
        className="pb-0 md:pb-0"
        description={description}
        eyebrow={eyebrow}
        pill={pill}
        title={title}
      />
      {visual && (
        <div
          className={cn(
            'mx-auto mt-14 animate-rise px-4 md:mt-20',
            wide ? 'max-w-6xl' : 'container'
          )}
          style={{ animationDelay: `${VISUAL_RISE_DELAY_MS}ms` }}
        >
          <div
            className={cn(
              'relative overflow-hidden max-md:overflow-x-auto',
              fade &&
                'max-h-[640px] [mask-image:linear-gradient(to_bottom,black_82%,transparent)]'
            )}
          >
            <div className={cn(wide && 'min-w-[960px]')}>{visual}</div>
          </div>
        </div>
      )}
    </>
  );
}
