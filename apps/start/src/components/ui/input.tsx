import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/utils/cn';

/** The filled, borderless surface every form field shares: inputs, textareas, select and combobox triggers, tag inputs. */
export const fieldSurface =
  'rounded-lg bg-def-200 text-foreground transition-[background-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive disabled:cursor-not-allowed disabled:opacity-50 dark:bg-def-300';

const inputVariant = cva(
  cn(
    fieldSurface,
    'flex w-full text-sm file:border-0 file:bg-transparent file:font-medium'
  ),
  {
    variants: {
      size: {
        sm: 'h-8 rounded-md px-2.5',
        default: 'h-9 px-3',
        large: 'h-10 px-3.5',
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
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        autoCorrect="off"
        className={cn(inputVariant({ size, className }))}
        ref={ref}
        type={type}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
