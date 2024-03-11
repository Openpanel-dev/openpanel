import { isValidElement } from 'react';
import { cn } from '@/utils/cn';
import Link from 'next/link';

interface KeyValueProps {
  name: string;
  value: unknown;
  onClick?: () => void;
  href?: string;
}

export function KeyValue({ href, onClick, name, value }: KeyValueProps) {
  const clickable = href || onClick;
  const Component = href ? (Link as any) : onClick ? 'button' : 'div';

  return (
    <Component
      className={cn(
        'group overflow-hidden flex border border-border rounded-md text-xs divide-x font-medium self-start min-w-0 max-w-full transition-transform',
        clickable && 'hover:-translate-y-0.5'
      )}
      {...{ href, onClick }}
    >
      <div className="p-1 px-2 bg-black/5">{name}</div>
      <div
        className={cn(
          'p-1 px-2 font-mono text-blue-700 bg-white whitespace-nowrap overflow-hidden text-ellipsis shadow-[inset_0_0_0_1px_#fff]',
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
      className="group flex text-[10px] sm:text-xs gap-2 font-medium self-start min-w-0 max-w-full items-center"
      {...{ href, onClick }}
    >
      <div className="text-gray-400">{name}</div>
      <div
        className={cn(
          'bg-black/5 rounded p-0.5 px-1 sm:p-1 sm:px-2 text-gray-600 whitespace-nowrap text-ellipsis flex items-center gap-1',
          clickable && 'group-hover:underline'
        )}
      >
        {value}
      </div>
    </Component>
  );
}
