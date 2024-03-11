import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import { ChevronUp } from 'lucide-react';
import AnimateHeight from 'react-animate-height';

import { Button } from '../ui/button';

interface ExpandableListItemProps {
  children: React.ReactNode;
  content: React.ReactNode;
  title: React.ReactNode;
  image?: React.ReactNode;
  initialOpen?: boolean;
  className?: string;
}
export function ExpandableListItem({
  title,
  content,
  image,
  initialOpen = false,
  children,
  className,
}: ExpandableListItemProps) {
  const [open, setOpen] = useState(initialOpen ?? false);
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="p-2 sm:p-4 flex gap-4">
        <div className="flex gap-1">{image}</div>
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <div className="text-md font-medium leading-none mb-1">{title}</div>
          {!!content && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              {content}
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setOpen((p) => !p)}
          className="bg-black/5 hover:bg-black/10"
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
