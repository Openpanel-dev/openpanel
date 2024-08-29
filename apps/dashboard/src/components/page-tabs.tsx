'use client';

import { cn } from '@/utils/cn';
import Link from 'next/link';

export function PageTabs({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 whitespace-nowrap pb-2 text-3xl font-semibold">
        {children}
      </div>
    </div>
  );
}

export function PageTabsItem({
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
