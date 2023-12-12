import type { HtmlProps } from '@/types';
import { cn } from '@/utils/cn';

type CardProps = HtmlProps<HTMLDivElement> & {
  hover?: boolean;
};

export function Card({ children, hover }: CardProps) {
  return (
    <div
      className={cn(
        'border border-border rounded',
        hover &&
          'transition-all hover:-translate-y-0.5 hover:shadow hover:border-black'
      )}
    >
      {children}
    </div>
  );
}
