import type { LucideIcon } from 'lucide-react';
import { BoxSelectIcon } from 'lucide-react';
import { PageHeader } from './page-header';
import { cn } from '@/utils/cn';

interface FullPageEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function FullPageEmptyState({
  icon: Icon = BoxSelectIcon,
  title,
  description,
  children,
  className,
}: FullPageEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center p-4 text-center',
        className
      )}
    >
      <div className="flex w-full max-w-xl flex-col items-center justify-center p-8">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon size={60} strokeWidth={1} />
        </div>

        <PageHeader className="mb-4" description={description} title={title} />

        {children}
      </div>
    </div>
  );
}
