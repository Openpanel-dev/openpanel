'use client';

import * as React from 'react';
import { cn } from '@/utils/cn';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex h-[20px] items-center rounded-full border px-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'bg-def-100 hover:bg-def-100/80 border-transparent text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive-foreground text-destructive hover:bg-destructive/80',
        success:
          'border-transparent bg-emerald-500 text-emerald-100 hover:bg-emerald-500/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
