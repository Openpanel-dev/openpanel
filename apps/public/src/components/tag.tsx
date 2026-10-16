import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const tagVariants = cva(
  'center-center h-7 gap-2 self-auto rounded-full border px-4 text-xs shadow-sm',
  {
    variants: {
      variant: {
        light:
          'bg-background-light text-muted-foreground dark:bg-background-dark',
        dark: 'border-background/10 bg-foreground-light text-muted shadow-background/5 dark:bg-foreground-dark',
      },
    },
    defaultVariants: {
      variant: 'light',
    },
  }
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
