import { cn } from '@/utils/cn';
import Link from 'next/link';

interface KeyValueProps {
  name: string;
  value: string | number | undefined;
  onClick?: () => void;
  href?: string;
}

export function KeyValue({ href, onClick, name, value }: KeyValueProps) {
  const clickable = href || onClick;
  const Component = href ? (Link as any) : onClick ? 'button' : 'div';
  return (
    <Component
      className="group flex border border-border rounded-md text-xs divide-x font-medium self-start min-w-0 max-w-full"
      {...{ href, onClick }}
    >
      <div className="p-1 px-2">{name}</div>
      <div
        className={cn(
          'p-1 px-2 font-mono text-blue-700 bg-slate-50 whitespace-nowrap overflow-hidden text-ellipsis',
          clickable && 'group-hover:underline'
        )}
      >
        {value}
      </div>
    </Component>
  );
}

export function KeyValueSubtle({ href, onClick, name, value }: KeyValueProps) {
  const clickable = href || onClick;
  const Component = href ? (Link as any) : onClick ? 'button' : 'div';
  return (
    <Component
      className="group flex text-xs gap-2 font-medium self-start min-w-0 max-w-full items-center"
      {...{ href, onClick }}
    >
      <div className="text-gray-400">{name}</div>
      <div
        className={cn(
          'bg-slate-100 rounded p-1 px-2 text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis',
          clickable && 'group-hover:underline'
        )}
      >
        {value}
      </div>
    </Component>
  );
}
