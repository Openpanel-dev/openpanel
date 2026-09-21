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
      <span className="font-semibold text-lg">Table of contents</span>
      <ul>
        {toc.map((item) => (
          <li
            className="py-1"
            key={item.url}
            style={{ marginLeft: `${(item.depth - 2) * (4 * 4)}px` }}
          >
            <Link
              className="row group/toc-item items-center gap-2 hover:underline"
              href={item.url}
              title={item.title?.toString() ?? ''}
            >
              <ArrowRightIcon className="h-4 w-4 shrink-0 opacity-30 transition-opacity group-hover/toc-item:opacity-100" />
              <span className="truncate text-sm">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </FeatureCardContainer>
  );
};
