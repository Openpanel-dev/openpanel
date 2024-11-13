import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

export function Feature({
  children,
  media,
  reverse = false,
  className,
}: {
  children: React.ReactNode;
  media?: React.ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border rounded-lg bg-background-light overflow-hidden',
        className,
      )}
    >
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 gap-4 items-center',
          !media && '!grid-cols-1',
        )}
      >
        <div className={cn(reverse && 'md:order-last', 'p-10')}>{children}</div>
        {media && (
          <div
            className={cn(
              'bg-background-dark h-full',
              reverse && 'md:order-first',
            )}
          >
            {media}
          </div>
        )}
      </div>
    </div>
  );
}

export function FeatureContent({
  icon,
  title,
  content,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  content: string[];
  className?: string;
}) {
  return (
    <div className={className}>
      {icon && (
        <div className="bg-foreground text-background rounded-md p-4 inline-block mb-1">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-medium mb-2">{title}</h2>
      <div className="col gap-2">
        {content.map((c, i) => (
          <p className="text-muted-foreground" key={i.toString()}>
            {c}
          </p>
        ))}
      </div>
    </div>
  );
}

export function FeatureList({
  title,
  items,
  className,
  cols = 2,
}: {
  title: string;
  items: React.ReactNode[];
  className?: string;
  cols?: number;
}) {
  return (
    <div className={className}>
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <div
        className={cn(
          '-mx-2 [&>div]:p-2 [&>div]:row [&>div]:items-center [&>div]:gap-2 grid',
          cols === 1 && 'grid-cols-1',
          cols === 2 && 'grid-cols-2',
          cols === 3 && 'grid-cols-3',
        )}
      >
        {items.map((i, j) => (
          <div key={j.toString()}>{i}</div>
        ))}
      </div>
    </div>
  );
}

export function FeatureMore({
  children,
  href,
  className,
}: {
  children: React.ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'font-medium items-center row justify-between border-t py-4',
        className,
      )}
    >
      {children} <ChevronRightIcon className="size-4" strokeWidth={1.5} />
    </Link>
  );
}
