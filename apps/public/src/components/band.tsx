import { cn } from '@/lib/utils';

const TONES = {
  // Plain page background.
  canvas: 'bg-canvas',
  // Full-width warm grey, for sections that should feel like a chapter break.
  grey: 'bg-stone-200/50',
  // Fades from the page background into grey; use for the last band on a page.
  fade: 'bg-linear-to-b from-canvas to-stone-200/70',
} as const;

// A full-width section with the content kept inside the container.
// `backdrop` spans the whole band and sits behind the content.
export function Band({
  tone = 'canvas',
  children,
  backdrop,
  className,
  innerClassName,
  id,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  backdrop?: React.ReactNode;
  className?: string;
  innerClassName?: string;
  id?: string;
}) {
  return (
    <section
      className={cn('relative py-20 md:py-28', TONES[tone], className)}
      id={id}
    >
      {backdrop}
      <div className={cn('container relative', innerClassName)}>{children}</div>
    </section>
  );
}
