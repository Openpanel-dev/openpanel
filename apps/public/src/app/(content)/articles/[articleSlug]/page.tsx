import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { ArticleCard } from '@/components/article-card';
import { FeatureCardContainer } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Logo } from '@/components/logo';
import { SectionHeader } from '@/components/section';
import { Toc } from '@/components/toc';
import { getAuthor, url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { articleSource } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

export async function generateStaticParams() {
  const articles = await articleSource.getPages();
  return articles.map((article) => {
    // Extract slug from URL (e.g., '/articles/my-article' -> 'my-article')
    const slug = article.url.replace(/^\/articles\//, '').replace(/\/$/, '');
    return { articleSlug: slug };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ articleSlug: string }>;
}): Promise<Metadata> {
  const { articleSlug } = await params;
  const article = await articleSource.getPage([articleSlug]);
  const author = getAuthor(article?.data.team);

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
  const author = getAuthor(article?.data.team);
  const goBackUrl = '/articles';

  const relatedArticles = (await articleSource.getPages())
    .filter(
      (item) => item.data.tag === article?.data.tag && item.url !== article?.url
    )
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  if (!Body) {
    return notFound();
  }

  // Create the JSON-LD data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article?.data.title,
    datePublished: article?.data.date.toISOString(),
    dateModified:
      article?.data.updated?.toISOString() || article?.data.date.toISOString(),
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
      <HeroContainer>
        <div className="col">
          <Link
            className="mb-4 flex items-center gap-2 text-muted-foreground"
            href={goBackUrl}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Back to all articles</span>
          </Link>
          <SectionHeader
            as="h1"
            description={article?.data.description}
            title={article?.data.title}
          />
          <div className="row mt-8 items-center gap-4">
            <div className="center-center size-10 rounded-full bg-black">
              {author.image ? (
                <Image
                  alt={author.name}
                  className="size-10 rounded-full object-cover"
                  height={48}
                  src={author.image}
                  width={48}
                />
              ) : (
                <Logo className="h-6 w-6 fill-white" />
              )}
            </div>
            <div className="col">
              <p className="font-medium">{author.name}</p>
              <div className="row gap-2">
                <p className="text-muted-foreground text-sm">
                  {article?.data.date.toLocaleDateString()}
                </p>
                {article?.data.updated && (
                  <p className="text-muted-foreground text-sm italic">
                    Updated on {article?.data.updated.toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </HeroContainer>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="article-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <article className="col container max-w-5xl">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="prose [&_img]:h-auto [&_img]:max-w-full [&_table]:w-auto">
              <Body components={getMDXComponents()} />
            </div>
          </div>
          <aside className="col gap-8 pb-12 pl-12">
            <Toc toc={article?.data.toc} />
            <FeatureCardContainer className="gap-2">
              <span className="font-semibold text-lg">Try OpenPanel</span>
              <p className="mb-4 text-muted-foreground text-sm">
                Give it a spin for free. No credit card required.
              </p>
              <GetStartedButton />
            </FeatureCardContainer>
          </aside>
        </div>

        {relatedArticles.length > 0 && (
          <div className="my-16">
            <h3 className="mb-8 font-bold text-2xl">Related articles</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {relatedArticles.map((item) => (
                <ArticleCard
                  cover={item.data.cover}
                  date={item.data.date}
                  key={item.url}
                  tag={item.data.tag}
                  team={item.data.team}
                  title={item.data.title}
                  url={item.url}
                />
              ))}
            </div>
          </div>
        )}
      </article>
      <Testimonials />
      <CtaBanner />
    </div>
  );
}
