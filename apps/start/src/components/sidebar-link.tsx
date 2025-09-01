import { cn } from '@/utils/cn';
import { useRouter } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

import { ProjectLink } from '@/components/links';

export function SidebarLink({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const active = overrideActive || href === pathname;
  return (
    <ProjectLink
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200',
        active && 'bg-def-200',
        className,
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </ProjectLink>
  );
}
