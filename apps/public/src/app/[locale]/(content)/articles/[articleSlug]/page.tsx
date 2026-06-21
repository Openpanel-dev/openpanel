import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { Testimonials } from '@/app/[locale]/(home)/_sections/testimonials';
import { ArticleCard } from '@/components/article-card';
import { FeatureCardContainer } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Logo } from '@/components/logo';
import { SectionHeader } from '@/components/section';
import { Toc } from '@/components/toc';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { url, getAuthor } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getArticlePage, getArticlePages } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Script from 'next/script';

export async function generateStaticParams() {
  const articles = getArticlePages();
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
  const locale = await getAppLocale();
  const article = getArticlePage([articleSlug], locale);

  if (!article) {
    const t = await getTranslations('pages');
    return {
      title: t('not_found_article_title'),
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
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const home = await getTranslations('home');
  const common = await getTranslations('common');
  const article = getArticlePage([articleSlug], locale);
  const Body = article?.data.body;
  const author = getAuthor(article?.data.team);
  const goBackUrl = localizedHref('/articles', locale);

  const relatedArticles = getArticlePages(locale)
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
            href={goBackUrl}
            className="flex items-center gap-2 mb-4 text-muted-foreground"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>{t('articles_back')}</span>
          </Link>
          <SectionHeader
            as="h1"
            title={article?.data.title}
            description={article?.data.description}
          />
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
        strategy="beforeInteractive"
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="container max-w-5xl col">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-0">
          <div className="min-w-0">
            <div className="prose [&_table]:w-auto [&_img]:max-w-full [&_img]:h-auto">
              <Body components={getMDXComponents(undefined, locale)} />
            </div>
          </div>
          <aside className="pl-12 pb-12 gap-8 col">
            <Toc toc={article?.data.toc} />
            <FeatureCardContainer className="gap-2">
              <span className="text-lg font-semibold">
                {t('sidebar_cta_title')}
              </span>
              <p className="text-muted-foreground text-sm mb-4">
                {t('sidebar_cta_description')}
              </p>
              <GetStartedButton locale={locale} />
            </FeatureCardContainer>
          </aside>
        </div>

        {relatedArticles.length > 0 && (
          <div className="my-16">
            <h3 className="text-2xl font-bold mb-8">
              {t('articles_related')}
            </h3>
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
      </article>
      <Testimonials />
      <CtaBanner
        title={`${home('cta_title_line_1')}\n${home('cta_title_line_2')}`}
        description={home('cta_description')}
        ctaText={common('start_free_trial')}
        ctaLink="https://dashboard.openpanel.dev/onboarding"
      />
    </div>
  );
}
