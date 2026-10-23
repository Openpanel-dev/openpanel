import { InboxIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * page: a whole route (not found, no access, maintenance); fills the viewport.
 * section: the body of a page whose header stays (no dashboards yet).
 * inline: inside a table, widget or card that already draws a frame.
 */
export type EmptyStateVariant = 'page' | 'section' | 'inline';

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  /** Actions: buttons and links shown under the description. */
  children?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}

const CONTAINER_CLASS: Record<EmptyStateVariant, string> = {
  page: 'min-h-[calc(100dvh-4rem)] px-6 py-16 lg:min-h-dvh',
  section: 'rounded-xl border border-dashed px-6 py-16 sm:py-24',
  inline: 'px-4 py-10',
};

const TILE_CLASS: Record<EmptyStateVariant, string> = {
  page: 'size-14 rounded-2xl [&_svg]:size-6',
  section: 'size-12 rounded-2xl [&_svg]:size-5',
  inline: 'size-10 rounded-xl [&_svg]:size-4',
};

const TITLE_CLASS: Record<EmptyStateVariant, string> = {
  page: 'text-2xl tracking-tight',
  section: 'text-lg',
  inline: 'text-sm',
};

const DESCRIPTION_CLASS: Record<EmptyStateVariant, string> = {
  page: 'text-base',
  section: 'text-sm',
  inline: 'text-sm',
};

/** Diameters of the rings drawn behind the icon tile, inner to outer. */
const RING_SIZES: Record<EmptyStateVariant, readonly number[]> = {
  page: [112, 192, 272, 352],
  section: [96, 160, 224, 288],
  inline: [72, 120, 168],
};

const RING_FADE =
  '[mask-image:radial-gradient(closest-side,black_20%,transparent_100%)]';

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  children,
  variant = 'section',
  className,
}: EmptyStateProps) {
  const ringSizes = RING_SIZES[variant];
  const ringCanvas = ringSizes.at(-1);

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden text-center',
        CONTAINER_CLASS[variant],
        className
      )}
    >
      <div className="relative mb-5">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            RING_FADE
          )}
          style={{ width: ringCanvas, height: ringCanvas }}
        >
          {ringSizes.map((size, index) => (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10 dark:border-foreground/15"
              key={size}
              style={{
                width: size,
                height: size,
                opacity: 1 - index / ringSizes.length,
              }}
            />
          ))}
        </div>
        <div
          className={cn(
            'relative flex items-center justify-center bg-card text-muted-foreground shadow-sm ring-1 ring-border',
            TILE_CLASS[variant]
          )}
        >
          <Icon />
        </div>
      </div>

      <h2 className={cn('relative font-semibold', TITLE_CLASS[variant])}>
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'relative mt-1.5 max-w-sm text-pretty text-muted-foreground',
            DESCRIPTION_CLASS[variant]
          )}
        >
          {description}
        </p>
      )}
      {children && (
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
