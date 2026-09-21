'use client';

import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeatureCardContainer } from '@/components/feature-card';
import { cn } from '@/lib/utils';

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
        'sticky top-24 hidden h-fit w-64 shrink-0 md:block',
        'col gap-3 rounded-xl border bg-background/50 p-4 backdrop-blur-sm',
        className
      )}
    >
      <nav className="col gap-1">
        {items.map((item) => (
          <Link
            className="group/toc relative flex min-h-6 items-center py-1 text-muted-foreground text-sm transition-colors duration-200 hover:text-foreground"
            href={`${pathname}#${item.id}`}
            key={item.id}
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
            <div className="absolute left-0 flex w-0 items-center overflow-hidden transition-all duration-300 ease-out group-hover/toc:w-5">
              <ArrowRightIcon className="size-3 shrink-0 -translate-x-full transition-transform delay-75 duration-300 ease-out group-hover/toc:translate-x-0" />
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
