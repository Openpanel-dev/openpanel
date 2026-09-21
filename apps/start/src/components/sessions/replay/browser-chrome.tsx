import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function BrowserChrome({
  url,
  children,
  right,
  controls = (
    <div className="flex gap-1.5">
      <div className="h-3 w-3 rounded-full bg-red-500" />
      <div className="h-3 w-3 rounded-full bg-yellow-500" />
      <div className="h-3 w-3 rounded-full bg-green-500" />
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
        className
      )}
    >
      <div className="flex h-10 items-center gap-2 border-border border-b bg-background px-4 py-2">
        {controls}
        {url !== false && (
          <div className="mx-4 flex h-8 flex-1 items-center truncate rounded-md border border-border bg-def-100 px-3 py-1 text-sm">
            {url}
          </div>
        )}
        {right}
      </div>
      {children}
    </div>
  );
}
