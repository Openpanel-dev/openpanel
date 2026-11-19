import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

const deltaChipVariants = cva(
  'flex items-center justify-center gap-0.5 font-medium tabular-nums',
  {
    variants: {
      variant: {
        inc: 'text-emerald-600 dark:text-emerald-400',
        dec: 'text-red-600 dark:text-red-400',
        default: 'text-muted-foreground',
      },
      size: {
        xs: 'text-2xs',
        sm: 'text-2xs',
        md: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

type DeltaChipProps = VariantProps<typeof deltaChipVariants> & {
  children: React.ReactNode;
  inverted?: boolean;
};

const iconVariants: Record<NonNullable<DeltaChipProps['size']>, number> = {
  xs: 10,
  sm: 10,
  md: 14,
  lg: 16,
};

const getVariant = (variant: DeltaChipProps['variant'], inverted?: boolean) => {
  if (inverted) {
    return variant === 'inc' ? 'dec' : variant === 'dec' ? 'inc' : variant;
  }
  return variant;
};

export function DeltaChip({
  variant,
  size,
  inverted,
  children,
}: DeltaChipProps) {
  return (
    <div
      className={cn(
        deltaChipVariants({ variant: getVariant(variant, inverted), size })
      )}
    >
      {variant === 'inc' ? (
        <ArrowUpIcon className="shrink-0" size={iconVariants[size || 'md']} />
      ) : variant === 'dec' ? (
        <ArrowDownIcon className="shrink-0" size={iconVariants[size || 'md']} />
      ) : null}
      <span>{children}</span>
    </div>
  );
}
