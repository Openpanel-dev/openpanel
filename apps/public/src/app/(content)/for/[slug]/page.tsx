import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { ForBenefits } from './_components/for-benefits';
import { ForFaq } from './_components/for-faq';
import { ForFeatures } from './_components/for-features';
import { ForHero } from './_components/for-hero';
import { ForPillars } from './_components/for-pillars';
import { ForProblem } from './_components/for-problem';
import { ForRelatedLinksSection } from './_components/for-related-links';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { getAllForSlugs, getForData } from '@/lib/for';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

export async function generateStaticParams() {
  const slugs = await getAllForSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getForData(slug);

  if (!data) {
    return {
      title: 'Page Not Found',
    };
  }

  return getPageMetadata({
    title: data.seo.title,
    description: data.seo.description,
    url: data.url,
    image: getOgImageUrl(data.url),
  });
}

export default async function ForPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getForData(slug);

  if (!data) {
    return notFound();
  }

  const pageUrl = url(`/for/${slug}`);

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
        id="for-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <ForHero data={data} />
      <div id="problem">
        <ForProblem problem={data.problem} />
      </div>
      <ForPillars audience={data.audience} />
      <ForFeatures features={data.features} />
      <ForBenefits benefits={data.benefits} />
      <ForFaq faqs={data.faqs} />
      <ForRelatedLinksSection relatedLinks={data.related_links} />
      <CtaBanner
        ctaLink={data.ctas.primary.href}
        ctaText={data.ctas.primary.label}
      />
    </div>
  );
}
