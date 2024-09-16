'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HtmlProps } from '@/types';
import { cn } from '@/utils/cn';
import { MoreHorizontal } from 'lucide-react';

type CardProps = HtmlProps<HTMLDivElement> & {
  hover?: boolean;
};

export function Card({ children, hover, className }: CardProps) {
  return (
    <div
      className={cn(
        'card relative',
        hover && 'transition-all hover:-translate-y-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardActionsProps {
  children: React.ReactNode;
}
export function CardActions({ children }: CardActionsProps) {
  return (
    <div className="absolute right-2 top-2 z-10">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded hover:border">
          <MoreHorizontal size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuGroup>{children}</DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const CardActionsItem = DropdownMenuItem;
