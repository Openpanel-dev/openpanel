'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const REVEAL_THRESHOLD = 0.15;

// Fades and lifts its children in the first time they scroll into view.
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'section';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: REVEAL_THRESHOLD, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      className={cn('reveal', visible && 'is-visible', className)}
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      style={
        delay
          ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
