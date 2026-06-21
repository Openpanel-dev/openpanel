import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { SectionHeader } from '@/components/section';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getContentPage, getPagePages } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}): Promise<Metadata> {
  const { pages } = await params;
  const locale = await getAppLocale();
  const page = getContentPage(pages, locale);

  if (!page) {
    return {
      title: 'Page Not Found',
    };
  }

  return getPageMetadata({
    title: page.data.title,
    url: url(page.url),
    description: page.data.description,
    image: getOgImageUrl(page.url),
  });
}

export async function generateStaticParams() {
  const pages = getPagePages();
  return pages.map((page) => ({
    pages: page.url.split('/').slice(1),
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}) {
  const { pages } = await params;
  const locale = await getAppLocale();
  const page = getContentPage(pages, locale);
  const Body = page?.data.body;

  if (!page || !Body) {
    return notFound();
  }

  // Create the JSON-LD data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.data.title,
    description: page.data.description,
    url: url(page.url),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.png'),
      },
    },
  };

  return (
    <div>
      <Script
        id="page-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroContainer>
        <SectionHeader
          as="h1"
          title={page.data.title}
          description={page.data.description}
        />
      </HeroContainer>
      <main className="container">
        <article className="prose">
          <Body components={getMDXComponents(undefined, locale)} />
        </article>
      </main>
    </div>
  );
}
