import type { TableOfContents } from 'fumadocs-core/server';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';

interface Props {
  toc: TableOfContents;
}

export const Toc: React.FC<Props> = ({ toc }) => {
  return (
    <nav className="bg-background-light border rounded-lg pb-2 w-[280px]">
      <span className="block font-medium p-4 pb-2">Table of contents</span>
      <ul>
        {toc.map((item) => (
          <li
            key={item.url}
            style={{ marginLeft: `${(item.depth - 2) * (4 * 4)}px` }}
            className="p-2 px-4"
          >
            <Link
              href={item.url}
              className="hover:underline row gap-2 items-center group"
              title={item.title?.toString() ?? ''}
            >
              <ArrowRightIcon className="shrink-0 w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />
              <span className="truncate text-sm">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
