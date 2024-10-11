'use client';

import { cn } from '@/utils/cn';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

const buttonVariants = cva(
  'inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap rounded-md  font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        cta: 'bg-blue-600 text-primary-foreground hover:bg-blue-500',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      children,
      loading,
      disabled,
      icon,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const Icon = loading ? Loader2 : (icon ?? null);
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {Icon && (
          <Icon className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
Button.defaultProps = {
  type: 'button',
};

export { Button, buttonVariants };

export interface ALinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonVariants> {}

export const ALink = ({
  variant,
  size,
  className,
  children,
  ...props
}: ALinkProps) => {
  return (
    <a {...props} className={cn(buttonVariants({ variant, size, className }))}>
      {children}
    </a>
  );
};
