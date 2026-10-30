import Image from 'next/image';
import Link from 'next/link';
import { Logo } from './logo';
import { cn } from '@/lib/utils';

export function formatArticleDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ArticleCard({
  url,
  title,
  description,
  tag,
  cover,
  date,
  featured = false,
}: {
  url: string;
  title: string;
  description?: string;
  tag?: string;
  cover?: string;
  date: Date;
  featured?: boolean;
}) {
  return (
    <Link
      className={cn(
        'group col gap-4',
        featured && 'md:grid md:grid-cols-2 md:items-center md:gap-10'
      )}
      href={url}
    >
      <span className="block overflow-hidden rounded-2xl border bg-muted">
        {cover ? (
          <Image
            alt=""
            className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            height={featured ? 450 : 225}
            src={cover}
            width={featured ? 800 : 400}
          />
        ) : (
          <span className="center-center aspect-video w-full bg-linear-to-br from-muted to-border/60">
            <Logo className="h-8 w-auto text-foreground/30" />
          </span>
        )}
      </span>
      <span className="col gap-2">
        <span className="row items-center gap-2 text-muted-foreground text-sm">
          {tag && <span className="font-medium text-foreground">{tag}</span>}
          {tag && <span aria-hidden>·</span>}
          <time dateTime={date.toISOString()}>{formatArticleDate(date)}</time>
        </span>
        <span
          className={cn(
            'text-balance font-semibold leading-snug tracking-tight transition-colors group-hover:text-blue-700',
            featured ? 'text-2xl md:text-3xl' : 'text-lg'
          )}
        >
          {title}
        </span>
        {featured && description && (
          <span className="line-clamp-3 text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </Link>
  );
}
