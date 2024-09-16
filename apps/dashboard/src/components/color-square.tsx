import type { HtmlProps } from '@/types';
import { cn } from '@/utils/cn';

type ColorSquareProps = HtmlProps<HTMLDivElement>;

export function ColorSquare({ children, className }: ColorSquareProps) {
  return (
    <div
      className={cn(
        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-blue-600 text-sm font-medium text-white [.mini_&]:h-4 [.mini_&]:w-4 [.mini_&]:text-[0.6rem]',
        className,
      )}
    >
      {children}
    </div>
  );
}
