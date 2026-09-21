// Thank you: https://ui.aceternity.com/components/infinite-moving-cards

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export const InfiniteMovingCards = <T,>({
  items,
  direction = 'left',
  speed = 'fast',
  pauseOnHover = true,
  className,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  direction?: 'left' | 'right';
  speed?: 'fast' | 'normal' | 'slow';
  pauseOnHover?: boolean;
  className?: string;
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLUListElement>(null);

  useEffect(() => {
    addAnimation();
  }, []);

  const [start, setStart] = useState(false);
  function addAnimation() {
    if (containerRef.current && scrollerRef.current) {
      const scrollerContent = Array.from(scrollerRef.current.children);

      scrollerContent.forEach((item) => {
        const duplicatedItem = item.cloneNode(true);
        if (scrollerRef.current) {
          scrollerRef.current.appendChild(duplicatedItem);
        }
      });

      getDirection();
      getSpeed();
      setStart(true);
    }
  }
  const getDirection = () => {
    if (containerRef.current) {
      if (direction === 'left') {
        containerRef.current.style.setProperty(
          '--animation-direction',
          'forwards'
        );
      } else {
        containerRef.current.style.setProperty(
          '--animation-direction',
          'reverse'
        );
      }
    }
  };
  const getSpeed = () => {
    if (containerRef.current) {
      if (speed === 'fast') {
        containerRef.current.style.setProperty('--animation-duration', '20s');
      } else if (speed === 'normal') {
        containerRef.current.style.setProperty('--animation-duration', '40s');
      } else {
        containerRef.current.style.setProperty('--animation-duration', '80s');
      }
    }
  };

  return (
    <div
      className={cn(
        'scroller relative z-20 -ml-4 w-screen overflow-hidden md:-ml-[1200px] md:w-[calc(100vw+1400px)]',
        className
      )}
      ref={containerRef}
    >
      <ul
        className={cn(
          'flex w-max min-w-full shrink-0 flex-nowrap items-start gap-8 py-4',
          start && 'animate-scroll',
          pauseOnHover && 'hover:[animation-play-state:paused]'
        )}
        ref={scrollerRef}
      >
        {items.map((item, idx) => (
          <li
            className="relative w-[310px] max-w-full shrink-0 md:w-[400px]"
            key={idx.toString()}
          >
            {renderItem(item, idx)}
          </li>
        ))}
      </ul>
    </div>
  );
};
