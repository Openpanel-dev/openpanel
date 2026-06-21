'use client';

import { FeatureCardContainer } from '@/components/feature-card';
import { cn } from '@/lib/utils';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TocItem {
  id: string;
  label: string;
}

interface CompareTocProps {
  items: TocItem[];
  className?: string;
}

export function CompareToc({ items, className }: CompareTocProps) {
  const pathname = usePathname();

  return (
    <FeatureCardContainer
      className={cn(
        'hidden md:block sticky top-24 h-fit w-64 shrink-0',
        'col gap-3 p-4 rounded-xl border bg-background/50 backdrop-blur-sm',
        className,
      )}
    >
      <nav className="col gap-1">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`${pathname}#${item.id}`}
            className="group/toc relative flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 py-1 min-h-6"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const offset = document.getElementById(`${item.id}`)?.offsetTop;
              if (offset) {
                window.scrollTo({
                  top: offset - 100,
                  behavior: 'smooth',
                });
              }
            }}
          >
            <div className="absolute left-0 flex items-center w-0 overflow-hidden transition-all duration-300 ease-out group-hover/toc:w-5">
              <ArrowRightIcon className="size-3 shrink-0 -translate-x-full group-hover/toc:translate-x-0 transition-transform duration-300 ease-out delay-75" />
            </div>
            <span className="transition-transform duration-300 ease-out group-hover/toc:translate-x-5">
              {item.label}
            </span>
          </Link>
        ))}
      </nav>
    </FeatureCardContainer>
  );
}
