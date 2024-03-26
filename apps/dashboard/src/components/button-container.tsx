import type { HtmlProps } from '@/types';
import { cn } from '@/utils/cn';

export function ButtonContainer({
  className,
  ...props
}: HtmlProps<HTMLDivElement>) {
  return (
    <div className={cn('mt-6 flex justify-between', className)} {...props} />
  );
}
