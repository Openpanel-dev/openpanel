'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOOLS } from './tools';
import { cn } from '@/lib/utils';

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
                className={cn(
                  'flex items-start gap-3 rounded-lg p-3 transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
                href={tool.url}
                key={tool.url}
              >
                <Icon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{tool.name}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
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
