import Image from 'next/image';
import Link from 'next/link';

export function ArticleCard({
  url,
  title,
  tag,
  cover,
  team,
  date,
}: {
  url: string;
  title: string;
  tag?: string;
  cover: string;
  team?: string;
  date: Date;
}) {
  return (
    <Link
      className="col overflow-hidden rounded-lg border bg-background-light transition-all duration-300 hover:scale-105 hover:shadow-background-dark hover:shadow-lg"
      href={url}
      key={url}
    >
      <Image
        alt={title}
        className="w-full"
        height={181}
        src={cover}
        width={323}
      />
      <span className="col flex-1 p-4">
        {tag && <span className="mb-2 font-mono text-xs">{tag}</span>}
        <span className="mb-6 flex-1">
          <h2 className="font-semibold text-xl">{title}</h2>
        </span>
        <p className="text-muted-foreground text-sm">
          {[team, date.toLocaleDateString()].filter(Boolean).join(' · ')}
        </p>
      </span>
    </Link>
  );
}
