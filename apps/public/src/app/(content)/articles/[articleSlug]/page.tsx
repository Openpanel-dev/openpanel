import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { ArticleCard, formatArticleDate } from '@/components/article-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Logo } from '@/components/logo';
import { Toc } from '@/components/toc';
import { resolveArticleCover } from '@/lib/article-cover';
import { getAuthor, url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { articleSource } from '@/lib/source';
import { cn } from '@/lib/utils';
import { getMDXComponents } from '@/mdx-components';

const RELATED_LIMIT = 3;
// Reading column in the middle, table of contents to the right on large screens.
const ARTICLE_GRID =
  'mx-auto grid max-w-3xl grid-cols-1 gap-12 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_13rem]';

export async function generateStaticParams() {
  const articles = await articleSource.getPages();
  return articles.map((article) => ({
    articleSlug: article.url.replace(/^\/articles\//, '').replace(/\/$/, ''),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ articleSlug: string }>;
}): Promise<Metadata> {
  const { articleSlug } = await params;
  const article = await articleSource.getPage([articleSlug]);

  if (!article) {
    return {
      title: 'Article Not Found',
    };
  }

  return getPageMetadata({
    title: article.data.title,
    description: article.data.description,
    url: url(article.url),
    image: getOgImageUrl(article.url),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ articleSlug: string }>;
}) {
  const { articleSlug } = await params;
  const article = await articleSource.getPage([articleSlug]);
  const Body = article?.data.body;

  if (!(article && Body)) {
    return notFound();
  }

  const author = getAuthor(article.data.team);
  const relatedArticles = (await articleSource.getPages())
    .filter(
      (item) => item.data.tag === article.data.tag && item.url !== article.url
    )
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .slice(0, RELATED_LIMIT);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.data.title,
    datePublished: article.data.date.toISOString(),
    dateModified:
      article.data.updated?.toISOString() || article.data.date.toISOString(),
    author: {
      '@type': 'Person',
      name: author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.png'),
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url(article.url),
    },
    image: {
      '@type': 'ImageObject',
      url: url(article.data.cover),
    },
  };

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="article-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <article className="container pt-32 md:pt-40">
        <div className={ARTICLE_GRID}>
          <header className="col max-w-3xl gap-6">
            <div className="row items-center gap-2 text-muted-foreground text-sm">
              <Link className="hover:text-foreground" href="/articles">
                Articles
              </Link>
              {article.data.tag && (
                <>
                  <span aria-hidden>/</span>
                  <span>{article.data.tag}</span>
                </>
              )}
            </div>
            <h1 className="text-balance font-semibold text-4xl leading-[1.1] tracking-tight md:text-5xl">
              {article.data.title}
            </h1>
            <p className="text-lg text-muted-foreground md:text-xl">
              {article.data.description}
            </p>
            <div className="row items-center gap-3 text-sm">
              <span className="center-center size-10 overflow-hidden rounded-full bg-foreground">
                {author.image ? (
                  <Image
                    alt={author.name}
                    className="size-10 object-cover"
                    height={40}
                    src={author.image}
                    width={40}
                  />
                ) : (
                  <Logo className="h-5 w-auto text-background" />
                )}
              </span>
              <span className="col">
                <span className="font-medium">{author.name}</span>
                <span className="text-muted-foreground">
                  <time dateTime={article.data.date.toISOString()}>
                    {formatArticleDate(article.data.date)}
                  </time>
                  {article.data.updated && (
                    <>
                      {' · '}Updated{' '}
                      <time dateTime={article.data.updated.toISOString()}>
                        {formatArticleDate(article.data.updated)}
                      </time>
                    </>
                  )}
                </span>
              </span>
            </div>
          </header>
        </div>

        <div className={cn(ARTICLE_GRID, 'mt-12')}>
          <div className="prose min-w-0 max-w-3xl [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_table]:w-auto">
            <Body components={getMDXComponents()} />
          </div>
          <aside className="hidden lg:block">
            <div className="col sticky top-28 gap-8">
              <Toc toc={article.data.toc} />
              <div className="col gap-2 rounded-2xl border p-5 text-sm">
                <span className="font-medium">Try OpenPanel</span>
                <p className="mb-2 text-muted-foreground">
                  Open-source analytics for your product, website and AI. Free
                  for 30 days.
                </p>
                <GetStartedButton className="h-9 w-fit px-4" />
              </div>
            </div>
          </aside>
        </div>

        {relatedArticles.length > 0 && (
          <section className="mx-auto mt-20 max-w-5xl border-t pt-12">
            <h2 className="mb-8 font-semibold text-2xl tracking-tight">
              Related articles
            </h2>
            <ul className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {relatedArticles.map((item) => (
                <li key={item.url}>
                  <ArticleCard
                    cover={resolveArticleCover(item.data.cover)}
                    date={item.data.date}
                    tag={item.data.tag}
                    title={item.data.title}
                    url={item.url}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <CtaBanner />
    </div>
  );
}
