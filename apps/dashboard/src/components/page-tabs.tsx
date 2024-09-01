import { cn } from '@/utils/cn';
import Link from 'next/link';

export function PageTabs({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="flex gap-4 whitespace-nowrap text-3xl font-semibold">
        {children}
      </div>
    </div>
  );
}

export function PageTabsLink({
  href,
  children,
  isActive = false,
}: {
  href: string;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <Link
      className={cn(
        'inline-block opacity-100 transition-transform hover:translate-y-[-1px]',
        isActive ? 'opacity-100' : 'opacity-50'
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

export function PageTabsItem({
  onClick,
  children,
  isActive = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-block opacity-100 transition-transform hover:translate-y-[-1px]',
        isActive ? 'opacity-100' : 'opacity-50'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
