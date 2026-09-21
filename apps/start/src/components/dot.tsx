import { cn } from '@/utils/cn';

interface DotProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

function filterCn(filter: string[], className: string | undefined) {
  const split: string[] = className?.split(' ') || [];
  return split
    .filter((item) => !filter.some((filterItem) => item.startsWith(filterItem)))
    .join(' ');
}

export function Dot({ className, size = 8, animated }: DotProps) {
  const style = {
    width: size,
    height: size,
  };
  return (
    <div
      className={cn(
        'relative',
        filterCn(['bg-', 'animate-', 'group-hover/row'], className)
      )}
      style={style}
    >
      <div
        className={cn(
          'absolute !m-0  rounded-full',
          animated !== false && 'animate-ping',
          className
        )}
        style={style}
      />
      <div
        className={cn(
          'absolute !m-0 rounded-full',
          filterCn(['animate-', 'group-hover/row'], className)
        )}
        style={style}
      />
    </div>
  );
}
