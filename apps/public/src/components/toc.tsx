import type { TableOfContents } from 'fumadocs-core/toc';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCardContainer } from './feature-card';

interface Props {
  toc: TableOfContents;
}

export const Toc: React.FC<Props> = ({ toc }) => {
  return (
    <FeatureCardContainer className="gap-2">
      <span className="text-lg font-semibold">Table of contents</span>
      <ul>
        {toc.map((item) => (
          <li
            key={item.url}
            className="py-1"
            style={{ marginLeft: `${(item.depth - 2) * (4 * 4)}px` }}
          >
            <Link
              href={item.url}
              className="hover:underline row gap-2 items-center group/toc-item"
              title={item.title?.toString() ?? ''}
            >
              <ArrowRightIcon className="shrink-0 w-4 h-4 opacity-30 group-hover/toc-item:opacity-100 transition-opacity" />
              <span className="truncate text-sm">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </FeatureCardContainer>
  );
};
