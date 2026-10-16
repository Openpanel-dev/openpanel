import { Link } from '@tanstack/react-router';
import { cn } from '@/utils/cn';

interface KeyValueProps {
  name: string;
  value: any;
  onClick?: () => void;
  href?: string;
}

export function KeyValue({ href, onClick, name, value }: KeyValueProps) {
  const clickable = href || onClick;
  const Component = (href ? Link : onClick ? 'button' : 'div') as 'button';

  return (
    <Component
      className={cn(
        'group flex min-w-0 max-w-full divide-x self-start overflow-hidden rounded-md border border-border font-medium text-sm transition-transform',
        clickable && 'hover:-translate-y-0.5'
      )}
      {...{ href, onClick }}
    >
      <div className="bg-black/5 p-1 px-2 capitalize">{name}</div>
      <div
        className={cn(
          'max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap bg-card p-1 px-2 font-mono text-highlight',
          clickable && 'group-hover:underline'
        )}
      >
        {value}
      </div>
    </Component>
  );
}
