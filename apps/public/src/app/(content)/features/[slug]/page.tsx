import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { WindowImage } from '@/components/window-image';
import {
  type FeatureData,
  getAllFeatureSlugs,
  getFeatureData,
} from '@/lib/features';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { Capabilities } from './_components/capabilities';
import { FeatureFaq } from './_components/feature-faq';
import { FeatureHero } from './_components/feature-hero';
import { FeatureUseCasesSection } from './_components/feature-use-cases';
import { HowItWorks } from './_components/how-it-works';
import { RelatedFeatures } from './_components/related-features';
import { WhatItIs } from './_components/what-it-is';

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

  if (!data) {
    return notFound();
  }

  const pageUrl = url(`/features/${slug}`);
  const capabilitiesSection = data.capabilities_section ?? {
    title: 'What you can do',
    intro: undefined,
  };

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
        id="feature-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FeatureHero hero={data.hero} />

      {data.screenshots[0] && (
        <div className="container my-16">
          <WindowImage {...data.screenshots[0]} />
        </div>
      )}

      <WhatItIs definition={data.definition} />

      <Capabilities
        title={capabilitiesSection.title}
        intro={capabilitiesSection.intro}
        capabilities={data.capabilities}
      />

      {data.screenshots[1] && (
        <div className="container my-16">
          <WindowImage {...data.screenshots[1]} />
        </div>
      )}

      {data.how_it_works && (
        <div id="how-it-works">
          <HowItWorks data={data.how_it_works} />
        </div>
      )}

      {data.screenshots[2] && (
        <div className="container my-16">
          <WindowImage {...data.screenshots[2]} />
        </div>
      )}

      <div id="use-cases">
        <FeatureUseCasesSection useCases={data.use_cases} />
      </div>

      <RelatedFeatures related={data.related_features} />

      <div id="faq">
        <FeatureFaq faqs={data.faqs} />
      </div>

      <CtaBanner
        title="Ready to get started?"
        description="Track events in minutes. Free 30-day trial, no credit card required."
        ctaText={data.cta.label}
        ctaLink={data.cta.href}
      />
    </div>
  );
}
