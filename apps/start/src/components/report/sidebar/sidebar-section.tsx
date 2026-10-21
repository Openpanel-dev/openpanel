import type { LucideIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

interface SidebarSectionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function SidebarSection({
  title,
  description,
  action,
  children,
}: SidebarSectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-medium text-3xs text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
          {description && (
            <p className="text-muted-foreground text-xs">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Quiet text-and-icon action used inside the builder: add filter, add breakdown, segment. */
export const BuilderChip = forwardRef<
  HTMLButtonElement,
  { icon: LucideIcon } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ icon: Icon, children, className, ...props }, ref) => (
  <button
    className={cn(
      'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-def-200 hover:text-foreground dark:hover:bg-def-300',
      className
    )}
    ref={ref}
    type="button"
    {...props}
  >
    <Icon className="shrink-0" size={13} />
    <span className="truncate">{children}</span>
  </button>
));
BuilderChip.displayName = 'BuilderChip';

/** Bordered list that holds the series, breakdown and global filter rows. */
export function BuilderList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col divide-y rounded-xl border', className)}
      {...props}
    />
  );
}
