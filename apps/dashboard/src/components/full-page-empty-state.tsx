import { cn } from '@/utils/cn';
import { BoxSelectIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FullPageEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function FullPageEmptyState({
  icon: Icon = BoxSelectIcon,
  title,
  children,
  className,
}: FullPageEmptyStateProps) {
  return (
    <div className={cn('flex items-center justify-center p-4', className)}>
      <div className="flex w-full max-w-xl flex-col items-center justify-center p-8">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon size={60} strokeWidth={1} />
        </div>

        <h1 className="mb-1 text-xl font-medium">{title}</h1>

        {children}
      </div>
    </div>
  );
}
