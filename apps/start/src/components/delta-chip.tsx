import { cn } from '@/utils/cn';
import { type VariantProps, cva } from 'class-variance-authority';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

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
        xs: 'px-1.5 py-0 leading-none text-[10px]',
        sm: 'px-2 py-1 text-xs',
        md: 'px-2 py-1 text-sm',
        lg: 'px-2 py-1 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
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
        deltaChipVariants({ variant: getVariant(variant, inverted), size }),
      )}
    >
      {variant === 'inc' ? (
        <ArrowUpIcon size={iconVariants[size || 'md']} className="shrink-0" />
      ) : variant === 'dec' ? (
        <ArrowDownIcon size={iconVariants[size || 'md']} className="shrink-0" />
      ) : null}
      <span>{children}</span>
    </div>
  );
}
