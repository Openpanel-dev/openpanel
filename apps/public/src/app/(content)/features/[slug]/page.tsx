import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { FEATURE_PAGES, isFeatureSlug } from '../_pages';
import { getAllFeatureSlugs, getFeatureData } from '@/lib/features';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

export async function generateStaticParams() {
  const slugs = await getAllFeatureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getFeatureData(slug);

  if (!data) {
    return {
      title: 'Feature Not Found',
    };
  }

  return getPageMetadata({
    title: data.seo.title,
    description: data.seo.description,
    url: data.url,
    image: getOgImageUrl(data.url),
  });
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getFeatureData(slug);

  if (!(data && isFeatureSlug(slug))) {
    return notFound();
  }

  const Page = FEATURE_PAGES[slug];
  const pageUrl = url(`/features/${slug}`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: data.seo.title,
    description: data.seo.description,
    url: pageUrl,
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.webp'),
      },
    },
  };

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="feature-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <Page data={data} />
    </div>
  );
}
