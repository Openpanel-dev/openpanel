'use client';

import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';

export function PageTabs({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('h-7 overflow-x-auto', className)}>
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
    <div className="relative">
      <Link
        className={cn(
          'inline-block opacity-100 transition-transform hover:translate-y-[-1px]',
          isActive ? 'opacity-100' : 'opacity-50',
        )}
        href={href}
      >
        {children}
      </Link>
      {isActive && (
        <motion.div
          className="rounded-full absolute -bottom-1 left-0 right-0 h-0.5 bg-primary"
          layoutId={'page-tabs-link'}
        />
      )}
    </div>
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
      type="button"
      className={cn(
        'inline-block opacity-100 transition-transform hover:translate-y-[-1px]',
        isActive ? 'opacity-100' : 'opacity-50',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
