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
    <div className={cn('p-4 flex items-center justify-center', className)}>
      <div className="p-8 w-full max-w-xl flex flex-col items-center justify-center">
        <div className="w-24 h-24 bg-white shadow-sm rounded-full flex justify-center items-center mb-6">
          <Icon size={60} strokeWidth={1} />
        </div>

        <h1 className="text-xl font-medium mb-1">{title}</h1>

        {children}
      </div>
    </div>
  );
}
