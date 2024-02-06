import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

import { Heading3 } from './copy';

interface WidgetProps {
  title: string;
  children: ReactNode;
  className?: string;
  icons: LucideIcon[];
  offsets: string[];
}

export function Widget({
  title,
  children,
  className,
  icons,
  offsets,
}: WidgetProps) {
  return (
    <div
      className={cn(
        'p-10 rounded-xl relative overflow-hidden flex flex-col hover:scale-105 transition-all duration-300 ease-in-out bg-white hover:shadow min-h-[300px] max-md:col-span-3',
        className
      )}
    >
      <Heading3 className="mb-4">{title}</Heading3>
      {children}
      <div className="flex justify-between mt-auto">
        {icons.map((Icon, i) => (
          <Icon
            key={i}
            size={120}
            className={cn('flex-shrink-0 opacity-10 relative', offsets?.[i])}
            strokeWidth={1.5}
          />
        ))}
      </div>
    </div>
  );
}
