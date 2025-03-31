import { url } from '@/app/layout.config';
import { ArticleCard } from '@/components/article-card';
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
            <ArticleCard
              key={item.url}
              url={item.url}
              title={item.data.title}
              tag={item.data.tag}
              cover={item.data.cover}
              team={item.data.team}
              date={item.data.date}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
