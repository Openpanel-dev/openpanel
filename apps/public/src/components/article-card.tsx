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
      href={url}
      key={url}
      className="border rounded-lg overflow-hidden bg-background-light col hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-background-dark"
    >
      <Image
        src={cover}
        alt={title}
        width={323}
        height={181}
        className="w-full"
      />
      <span className="p-4 col flex-1">
        {tag && <span className="font-mono text-xs mb-2">{tag}</span>}
        <span className="flex-1 mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
        </span>
        <p className="text-sm text-muted-foreground">
          {[team, date.toLocaleDateString()].filter(Boolean).join(' · ')}
        </p>
      </span>
    </Link>
  );
}
