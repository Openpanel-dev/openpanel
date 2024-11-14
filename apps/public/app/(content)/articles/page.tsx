import { url } from '@/app/layout.config';
import { articleSource } from '@/lib/source';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

const title = 'Articles';
const description = 'Read our latest articles';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: url('/articles'),
  },
  openGraph: {
    title,
    description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default async function Page() {
  const articles = (await articleSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return (
    <div>
      <div className="container col">
        <div className="py-16">
          <h1 className="text-center text-7xl font-bold">Articles</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          {articles.map((item) => (
            <Link
              href={item.url}
              key={item.url}
              className="border rounded-lg overflow-hidden bg-background-light col hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-background-dark"
            >
              <Image
                src={item.data.cover}
                alt={item.data.title}
                width={323}
                height={181}
                className="w-full"
              />
              <span className="p-4 col flex-1">
                {item.data.tag && (
                  <span className="font-mono text-xs mb-2">
                    {item.data.tag}
                  </span>
                )}
                <span className="flex-1 mb-6">
                  <h2 className="text-xl font-semibold">{item.data.title}</h2>
                </span>
                <p className="text-sm text-muted-foreground">
                  {[item.data.team, item.data.date.toLocaleDateString()]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
