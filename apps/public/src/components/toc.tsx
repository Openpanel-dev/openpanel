import type { TableOfContents } from 'fumadocs-core/toc';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const INDENT_PX = 12;

export function Toc({ toc }: { toc: TableOfContents }) {
  if (toc.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Table of contents" className="col gap-3 text-sm">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        On this page
      </span>
      <ul className="col gap-2 border-l">
        {toc.map((item) => (
          <li
            key={item.url}
            style={{ paddingLeft: `${(item.depth - 1) * INDENT_PX}px` }}
          >
            <Link
              className={cn(
                '-ml-px block border-transparent border-l pl-3 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground',
                item.depth > 2 && 'text-xs'
              )}
              href={item.url}
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
