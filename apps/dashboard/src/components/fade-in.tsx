'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

type Props = {
  className?: string;
  children: React.ReactNode;
};

export function FadeIn({ className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.classList.remove('opacity-0');
      ref.current.classList.add('opacity-100');
    }
  }, []);
  return (
    <div
      className={cn('opacity-0 transition-opacity duration-500', className)}
      ref={ref}
    >
      {children}
    </div>
  );
}
