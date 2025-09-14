import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

import { ProjectLink } from '@/components/links';

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
        'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        className,
      )}
      href={href}
      exact={exact}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </ProjectLink>
  );
}
