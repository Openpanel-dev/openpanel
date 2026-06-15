import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

import { ProjectLink } from '@/components/links';
import { SB_CENTER, SB_HIDE } from './sidebar-collapse';

export function SidebarLink({
  href,
  icon: Icon,
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
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors hover:bg-def-200 text-[13px]',
        SB_CENTER,
        className,
      )}
      href={href}
      exact={exact}
      title={typeof label === 'string' ? label : undefined}
    >
      <Icon size={20} className="shrink-0" />
      <div className={cn('flex-1', SB_HIDE)}>{label}</div>
    </ProjectLink>
  );
}
