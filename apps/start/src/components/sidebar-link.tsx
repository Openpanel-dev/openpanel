import type { LucideIcon } from 'lucide-react';
import { ProjectLink } from '@/components/links';
import { cn } from '@/utils/cn';

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
        'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200',
        className
      )}
      exact={exact}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </ProjectLink>
  );
}
