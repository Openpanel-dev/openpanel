import { cn } from '@/utils/cn';
import type { ReactNode } from 'react';

export function BrowserChrome({
  url,
  children,
  right,
  controls = (
    <div className="flex gap-1.5">
      <div className="w-3 h-3 rounded-full bg-red-500" />
      <div className="w-3 h-3 rounded-full bg-yellow-500" />
      <div className="w-3 h-3 rounded-full bg-green-500" />
    </div>
  ),
  className,
}: {
  url?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  controls?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background h-10">
        {controls}
        {url !== false && (
          <div className="flex-1 mx-4 px-3 h-8 py-1 text-sm bg-def-100 rounded-md border border-border flex items-center truncate">
            {url}
          </div>
        )}
        {right}
      </div>
      {children}
    </div>
  );
}
