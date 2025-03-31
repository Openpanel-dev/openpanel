import { url, getAuthor } from '@/app/layout.config';
import { SingleSwirl } from '@/components/Swirls';
import { ArticleCard } from '@/components/article-card';
import { Logo } from '@/components/logo';
import { SectionHeader } from '@/components/section';
import { Toc } from '@/components/toc';
import { Button } from '@/components/ui/button';
import { articleSource } from '@/lib/source';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';

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

  return {
    title: article.data.title,
    description: article.data.description,
    authors: [{ name: author.name }],
    alternates: {
      canonical: url(article.url),
    },
    openGraph: {
      title: article.data.title,
      description: article.data.description,
      type: 'article',
      publishedTime: article.data.date.toISOString(),
      authors: author.name,
      images: url(article.data.cover),
      url: url(article.url),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.data.title,
      description: article.data.description,
      images: url(article.data.cover),
    },
  };
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
      (item) =>
        item.data.tag === article?.data.tag && item.url !== article?.url,
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
        strategy="beforeInteractive"
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="container max-w-5xl col">
        <div className="py-16">
          <Link
            href={goBackUrl}
            className="flex items-center gap-2 mb-4 text-muted-foreground"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to all articles</span>
          </Link>
          <div className="flex-col-reverse col md:row gap-8">
            <div className="col flex-1">
              <h1 className="text-5xl font-bold leading-tight">
                {article?.data.title}
              </h1>

              <div className="row gap-4 items-center mt-8">
                <div className="size-10 center-center bg-black rounded-full">
                  {author.image ? (
                    <Image
                      className="size-10 object-cover rounded-full"
                      src={author.image}
                      alt={author.name}
                      width={48}
                      height={48}
                    />
                  ) : (
                    <Logo className="w-6 h-6 fill-white" />
                  )}
                </div>
                <div className="col">
                  <p className="font-medium">{author.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {article?.data.date.toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="col">
              <Image
                src={article?.data.cover}
                alt={article?.data.title}
                width={323}
                height={181}
                className="rounded-lg w-full md:w-auto"
              />
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="bg-gradient-to-b from-background to-transparent">
            <div className="float-right pl-12 pb-12 hidden md:block article:hidden">
              <Toc toc={article?.data.toc} />
            </div>
            <div className="prose">
              <Body />
            </div>
          </div>

          {relatedArticles.length > 0 && (
            <div className="my-16">
              <h3 className="text-2xl font-bold mb-8">Related articles</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedArticles.map((item) => (
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
          )}

          <div className="absolute top-0 -right-[300px] w-[300px] pl-12 h-full article:block hidden">
            <div className="sticky top-32 col gap-8">
              <Toc toc={article?.data.toc} />

              <section className="overflow-hidden relative bg-foreground dark:bg-background-dark text-background dark:text-foreground rounded-xl py-16">
                <SingleSwirl className="pointer-events-none absolute top-0 bottom-0 left-0 size-[300px]" />
                <SingleSwirl className="pointer-events-none rotate-180 absolute top-0 bottom-0 -right-0 opacity-50 size-[300px]" />
                <div className="container center-center col">
                  <SectionHeader
                    className="mb-8"
                    title="Try it"
                    description="Give it a spin for free. No credit card required."
                  />
                  <Button size="lg" variant="secondary" asChild>
                    <Link href="https://dashboard.openpanel.dev/onboarding">
                      Get started today!
                    </Link>
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
