import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import { ChevronUp } from 'lucide-react';
import AnimateHeight from 'react-animate-height';

import { Button } from '../ui/button';

interface ExpandableListItemProps {
  children: React.ReactNode;
  bullets: React.ReactNode[];
  title: string;
  image?: React.ReactNode;
  initialOpen?: boolean;
}
export function ExpandableListItem({
  title,
  bullets,
  image,
  initialOpen = false,
  children,
}: ExpandableListItemProps) {
  const [open, setOpen] = useState(initialOpen ?? false);
  return (
    <div className="bg-white shadow rounded-xl overflow-hidden">
      <div className="p-3 sm:p-6 flex gap-4 items-start">
        <div className="flex gap-1">{image}</div>
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <span className="text-lg font-medium leading-none mb-1">{title}</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
            {bullets.map((bullet) => (
              <span key={bullet}>{bullet}</span>
            ))}
          </div>
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setOpen((p) => !p)}
        >
          <ChevronUp
            size={20}
            className={cn(
              'transition-transform',
              open ? 'rotate-180' : 'rotate-0'
            )}
          />
        </Button>
      </div>
      <AnimateHeight duration={200} height={open ? 'auto' : 0}>
        <div className="border-t border-border">{children}</div>
      </AnimateHeight>
    </div>
  );
}
