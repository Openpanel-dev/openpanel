import { url } from '@/app/layout.config';
import { pageSource } from '@/lib/source';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';

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

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: url(page.url),
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'website',
      url: url(page.url),
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}) {
  const { pages } = await params;
  const page = await pageSource.getPage(pages);
  const Body = page?.data.body;

  if (!page || !Body) {
    return notFound();
  }

  // Create the JSON-LD data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.data.title,
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
      '@id': url(page.url),
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
      <article className="container max-w-4xl col">
        <div className="pt-16 pb-4 col gap-3">
          <h1 className="text-5xl font-bold">{page.data.title}</h1>
          {page.data.description && (
            <p className="text-muted-foreground text-xl">
              {page.data.description}
            </p>
          )}
        </div>
        <div className="prose">
          <Body />
        </div>
      </article>
    </div>
  );
}
