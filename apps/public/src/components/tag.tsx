import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const tagVariants = cva(
  'shadow-sm px-4 gap-2 center-center border self-auto text-xs rounded-full h-7',
  {
    variants: {
      variant: {
        light:
          'bg-background-light dark:bg-background-dark text-muted-foreground',
        dark: 'bg-foreground-light dark:bg-foreground-dark text-muted border-background/10 shadow-background/5',
      },
    },
    defaultVariants: {
      variant: 'light',
    },
  },
);

interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {}

export function Tag({ children, className, variant, ...props }: TagProps) {
  return (
    <span className={cn(tagVariants({ variant, className }))} {...props}>
      {children}
    </span>
  );
}
