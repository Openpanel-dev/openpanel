import type { TableOfContents } from 'fumadocs-core/toc';
import Link from 'next/link';
import { Children, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const INDENT_PX = 12;

// Headings can carry inline markup such as links. A link inside <Link> is
// invalid HTML and makes Next throw, so the table of contents shows plain text.
function headingText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return headingText(node.props.children);
  }
  return Children.toArray(node).map(headingText).join('');
}

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
              {headingText(item.title)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
