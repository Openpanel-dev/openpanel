import { cn } from '@/lib/utils';
import { ChevronRightIcon, ConeIcon } from 'lucide-react';
import Link from 'next/link';

export function SmallFeature({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-background-light rounded-lg p-1 border border-border group',
        className,
      )}
    >
      <div className="bg-background-dark rounded-lg p-8 h-full group-hover:bg-background-light transition-colors">
        {children}
      </div>
    </div>
  );
}

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
        'border rounded-lg bg-background-light overflow-hidden p-1',
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
              'bg-background-dark h-full rounded-md overflow-hidden',
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
  content: React.ReactNode[];
  className?: string;
}) {
  return (
    <div className={className}>
      {icon && (
        <div
          data-icon
          className="bg-foreground text-background rounded-md p-4 inline-block mb-6 transition-colors"
        >
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

export function FeatureListItem({
  icon: Icon,
  title,
}: { icon: React.ComponentType<any>; title: string }) {
  return (
    <div className="row items-center gap-2" key="funnel">
      <Icon className="size-4 text-foreground/70" strokeWidth={1.5} /> {title}
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
