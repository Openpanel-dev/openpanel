'use client';

import * as React from 'react';
import { cn } from '@/utils/cn';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

const buttonVariants = cva(
  'inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
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
        sm: 'h-8 rounded-md px-2',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  responsive?: boolean;
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
      responsive,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const Icon = loading ? Loader2 : icon ?? null;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {Icon && (
          <Icon
            className={cn(
              'mr-2 h-4 w-4 flex-shrink-0',
              responsive && 'mr-0 sm:mr-2',
              loading && 'animate-spin'
            )}
          />
        )}
        {responsive ? (
          <span className="hidden sm:block">{children}</span>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
Button.defaultProps = {
  type: 'button',
};
export interface LinkButtonProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  responsive?: boolean;
  href: string;
  prefetch?: boolean;
}

const LinkButton = React.forwardRef<
  typeof Link,
  React.PropsWithoutRef<LinkButtonProps>
>(
  (
    {
      className,
      variant,
      size,
      children,
      loading,
      icon,
      responsive,
      href,
      ...props
    },
    ref
  ) => {
    const Icon = loading ? Loader2 : icon ?? null;
    return (
      <Link
        href={href}
        className={cn(buttonVariants({ variant, size, className }))}
        // @ts-expect-error
        ref={ref}
        {...props}
      >
        {Icon && (
          <Icon
            className={cn(
              'mr-2 h-4 w-4 flex-shrink-0',
              responsive && 'mr-0 sm:mr-2',
              loading && 'animate-spin'
            )}
          />
        )}
        {responsive ? (
          <span className="hidden sm:block">{children}</span>
        ) : (
          children
        )}
      </Link>
    );
  }
);
LinkButton.displayName = 'LinkButton';

export { Button, LinkButton, buttonVariants };
