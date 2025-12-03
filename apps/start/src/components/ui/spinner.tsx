import { cn } from '@/utils/cn';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

const spinnerVariants = cva('', {
  variants: {
    size: {
      xs: 'h-3 w-3',
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
      xl: 'h-12 w-12',
    },
    variant: {
      default: 'text-muted-foreground',
      primary: 'text-primary',
      white: 'text-white',
      destructive: 'text-destructive',
    },
    speed: {
      slow: '[animation-duration:2s]',
      normal: '[animation-duration:1s]',
      fast: '[animation-duration:0.5s]',
    },
  },
  defaultVariants: {
    size: 'sm',
    variant: 'default',
    speed: 'normal',
  },
});

export interface SpinnerProps
  extends Omit<React.SVGProps<SVGSVGElement>, 'size' | 'speed'>,
    VariantProps<typeof spinnerVariants> {
  type?: 'circle' | 'dots' | 'pulse' | 'bars' | 'ring';
  className?: string;
}

const Spinner = ({
  className,
  size,
  variant,
  speed,
  type = 'circle',
  ref,
  ...props
}: SpinnerProps) => {
  const baseClasses = spinnerVariants({ size, variant, speed });
  const animationClass = type === 'pulse' ? 'animate-pulse' : 'animate-spin';
  const spinnerClasses = cn(baseClasses, animationClass, className);

  switch (type) {
    case 'circle':
      return (
        <svg
          ref={ref}
          className={spinnerClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          {...props}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      );

    case 'dots':
      return (
        <svg
          ref={ref}
          className={baseClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 24 24"
          {...props}
        >
          <circle cx="4" cy="12" r="3">
            <animate
              attributeName="opacity"
              dur="1s"
              repeatCount="indefinite"
              values="0;1;0"
              begin="0s"
            />
          </circle>
          <circle cx="12" cy="12" r="3">
            <animate
              attributeName="opacity"
              dur="1s"
              repeatCount="indefinite"
              values="0;1;0"
              begin="0.2s"
            />
          </circle>
          <circle cx="20" cy="12" r="3">
            <animate
              attributeName="opacity"
              dur="1s"
              repeatCount="indefinite"
              values="0;1;0"
              begin="0.4s"
            />
          </circle>
        </svg>
      );

    case 'pulse':
      return (
        <div
          ref={ref as unknown as React.RefObject<HTMLDivElement>}
          className={cn(
            'rounded-full bg-current animate-pulse',
            spinnerClasses,
          )}
          style={{
            animationDuration:
              speed === 'slow' ? '2s' : speed === 'fast' ? '0.5s' : '1s',
          }}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        />
      );

    case 'bars':
      return (
        <svg
          ref={ref}
          className={spinnerClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 24 24"
          {...props}
        >
          <rect x="1" y="6" width="2.8" height="12">
            <animate
              attributeName="height"
              dur="1s"
              repeatCount="indefinite"
              values="12;4;12"
              begin="0s"
            />
            <animate
              attributeName="y"
              dur="1s"
              repeatCount="indefinite"
              values="6;10;6"
              begin="0s"
            />
          </rect>
          <rect x="5.8" y="6" width="2.8" height="12">
            <animate
              attributeName="height"
              dur="1s"
              repeatCount="indefinite"
              values="12;4;12"
              begin="0.2s"
            />
            <animate
              attributeName="y"
              dur="1s"
              repeatCount="indefinite"
              values="6;10;6"
              begin="0.2s"
            />
          </rect>
          <rect x="10.6" y="6" width="2.8" height="12">
            <animate
              attributeName="height"
              dur="1s"
              repeatCount="indefinite"
              values="12;4;12"
              begin="0.4s"
            />
            <animate
              attributeName="y"
              dur="1s"
              repeatCount="indefinite"
              values="6;10;6"
              begin="0.4s"
            />
          </rect>
          <rect x="15.4" y="6" width="2.8" height="12">
            <animate
              attributeName="height"
              dur="1s"
              repeatCount="indefinite"
              values="12;4;12"
              begin="0.6s"
            />
            <animate
              attributeName="y"
              dur="1s"
              repeatCount="indefinite"
              values="6;10;6"
              begin="0.6s"
            />
          </rect>
          <rect x="20.2" y="6" width="2.8" height="12">
            <animate
              attributeName="height"
              dur="1s"
              repeatCount="indefinite"
              values="12;4;12"
              begin="0.8s"
            />
            <animate
              attributeName="y"
              dur="1s"
              repeatCount="indefinite"
              values="6;10;6"
              begin="0.8s"
            />
          </rect>
        </svg>
      );

    case 'ring':
      return (
        <svg
          ref={ref}
          className={spinnerClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          {...props}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <circle
            className="opacity-75"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray="32"
            strokeDashoffset="32"
          >
            <animate
              attributeName="stroke-dasharray"
              dur="2s"
              repeatCount="indefinite"
              values="0 32;16 16;0 32;0 32"
            />
            <animate
              attributeName="stroke-dashoffset"
              dur="2s"
              repeatCount="indefinite"
              values="0;-16;-32;-32"
            />
          </circle>
        </svg>
      );

    default:
      return (
        <svg
          ref={ref}
          className={spinnerClasses}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          {...props}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      );
  }
};

export { Spinner, spinnerVariants };
