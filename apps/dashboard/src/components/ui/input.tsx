'use client';

import * as React from 'react';
import { cn } from '@/utils/cn';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

const inputVariant = cva(
  'flex w-full rounded-md border border-input bg-card ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-8 px-3 py-2 text-sm',
        large: 'h-12 px-4 py-3 text-lg',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export type InputProps = VariantProps<typeof inputVariant> &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    error?: string | undefined;
  };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, size, ...props }, ref) => {
    return (
      <input
        autoComplete="off"
        autoCorrect="off"
        type={type}
        className={cn(
          inputVariant({ size, className }),
          !!error && 'border-destructive'
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
