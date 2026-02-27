import { Slot } from '@radix-ui/react-slot';
import { Link, type LinkComponentProps } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Spinner, type SpinnerProps } from './spinner';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  'inline-flex flex-shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-all hover:translate-y-[-0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        cta: 'bg-highlight text-white hover:bg-highlight/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-def-100 text-secondary-foreground hover:bg-def-100/80',
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
  loadingType?: SpinnerProps['type'];
  loadingSpeed?: SpinnerProps['speed'];
  icon?: LucideIcon;
  responsive?: boolean;
  autoHeight?: boolean;
  loadingAbsolute?: boolean;
}

function fixHeight({
  autoHeight,
  size,
}: {
  autoHeight?: boolean;
  size: ButtonProps['size'];
}) {
  if (autoHeight) {
    switch (size) {
      case 'lg':
        return 'h-auto min-h-11 py-2';
      case 'icon':
        return 'h-auto min-h-8 py-1';
      case 'default':
        return 'h-auto min-h-10 py-2';
      default:
        return 'h-auto min-h-8 py-1';
    }
  }
  return '';
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
      loadingType = 'circle',
      loadingSpeed = 'normal',
      disabled,
      icon,
      responsive,
      autoHeight,
      loadingAbsolute,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const Icon = loading ? null : (icon ?? null);

    // Determine spinner size based on button size
    const spinnerSize = size === 'lg' ? 'md' : size === 'icon' ? 'sm' : 'sm';

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          fixHeight({ autoHeight, size }),
          loadingAbsolute && 'relative'
        )}
        disabled={loading || disabled}
        ref={ref}
        type={type}
        {...props}
      >
        {loading && (
          <div
            className={cn(
              loadingAbsolute &&
                'center-center absolute top-0 right-0 bottom-0 left-0 bg-background/10 backdrop-blur'
            )}
          >
            <Spinner
              className={cn(
                'flex-shrink-0',
                size !== 'icon' && responsive && 'mr-0 sm:mr-2',
                size !== 'icon' && !responsive && 'mr-2'
              )}
              size={spinnerSize}
              speed={loadingSpeed}
              type={loadingType}
              variant={
                variant === 'default' || variant === 'cta' ? 'white' : 'default'
              }
            />
          </div>
        )}
        {Icon && (
          <Icon
            className={cn(
              'h-4 w-4 flex-shrink-0',
              size !== 'icon' && responsive && 'mr-0 sm:mr-2',
              size !== 'icon' && !responsive && 'mr-2'
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

const LinkButton = ({
  className,
  variant,
  size,
  children,
  loading,
  loadingType = 'circle',
  loadingSpeed = 'normal',
  icon,
  responsive,
  ...props
}: LinkComponentProps &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    loadingType?: SpinnerProps['type'];
    loadingSpeed?: SpinnerProps['speed'];
    icon?: LucideIcon;
    responsive?: boolean;
  }) => {
  const Icon = loading ? null : (icon ?? null);

  // Determine spinner size based on button size
  const spinnerSize = size === 'lg' ? 'md' : size === 'icon' ? 'sm' : 'sm';

  return (
    <Link
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {(linkProps) => (
        <>
          {loading && (
            <Spinner
              className={cn(
                'flex-shrink-0',
                responsive && 'mr-0 sm:mr-2',
                !responsive && 'mr-2'
              )}
              size={spinnerSize}
              speed={loadingSpeed}
              type={loadingType}
              variant={
                variant === 'default' || variant === 'cta' ? 'white' : 'default'
              }
            />
          )}
          {Icon && (
            <Icon
              className={cn(
                'mr-2 h-4 w-4 flex-shrink-0',
                responsive && 'mr-0 sm:mr-2'
              )}
            />
          )}
          {responsive ? (
            <span className="hidden sm:block">
              {typeof children === 'function' ? children(linkProps) : children}
            </span>
          ) : typeof children === 'function' ? (
            children(linkProps)
          ) : (
            children
          )}
        </>
      )}
    </Link>
  );
};

export { Button, LinkButton, buttonVariants };
