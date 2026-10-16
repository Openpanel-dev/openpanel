import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { pageSource } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}): Promise<Metadata> {
  const { pages } = await params;
  const page = await pageSource.getPage(pages);

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
  const pages = await pageSource.getPages();
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
  const page = await pageSource.getPage(pages);
  const Body = page?.data.body;

  if (!(page && Body)) {
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="page-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer>
        <SectionHeader
          as="h1"
          description={page.data.description}
          title={page.data.title}
        />
      </HeroContainer>
      <main className="container">
        <article className="prose">
          <Body components={getMDXComponents()} />
        </article>
      </main>
    </div>
  );
}
