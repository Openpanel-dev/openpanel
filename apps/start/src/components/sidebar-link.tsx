import type { LucideIcon } from 'lucide-react';
import { ProjectLink } from '@/components/links';
import { cn } from '@/utils/cn';

const SIDEBAR_ICON_SIZE = 18;

/** Shared look for every row in the sidebar; TanStack's Link sets `data-status`. */
export const sidebarItemClassName = cn(
  'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 font-medium text-foreground/75 text-sm',
  'transition-colors hover:bg-def-200 hover:text-foreground',
  'data-[status=active]:bg-def-200 data-[status=active]:text-foreground'
);

export const sidebarIconClassName = cn(
  'shrink-0 text-muted-foreground transition-colors',
  'group-hover:text-foreground group-data-[status=active]:text-foreground'
);

export function SidebarIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className={sidebarIconClassName} size={SIDEBAR_ICON_SIZE} />;
}

export function SidebarSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-5 mb-1.5 px-2.5 font-medium text-muted-foreground text-xs first:mt-0',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarLink({
  href,
  icon,
  label,
  className,
  exact,
}: {
  href: string;
  icon: LucideIcon;
  label: React.ReactNode;
  className?: string;
  exact?: boolean;
}) {
  return (
    <ProjectLink
      className={cn(sidebarItemClassName, className)}
      exact={exact}
      href={href}
    >
      <SidebarIcon icon={icon} />
      <div className="flex-1 truncate">{label}</div>
    </ProjectLink>
  );
}
