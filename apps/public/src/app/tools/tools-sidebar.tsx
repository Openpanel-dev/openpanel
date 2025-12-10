'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOOLS } from './tools';

export default function ToolsSidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside>
      <div className="lg:sticky lg:top-24">
        <nav className="space-y-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = pathname === tool.url;
            return (
              <Link
                key={tool.url}
                href={tool.url}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{tool.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
