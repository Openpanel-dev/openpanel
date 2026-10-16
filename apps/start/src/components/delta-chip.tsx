import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

const deltaChipVariants = cva(
  'flex items-center justify-center gap-1 rounded-full font-semibold',
  {
    variants: {
      variant: {
        inc: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        dec: 'bg-red-500/10 text-red-600 dark:text-red-400',
        default: 'bg-muted text-muted-foreground',
      },
      size: {
        xs: 'px-1.5 py-0 text-[10px] leading-none',
        sm: 'px-2 py-1 text-xs',
        md: 'px-2 py-1 text-sm',
        lg: 'px-2 py-1 text-base',
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
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
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
