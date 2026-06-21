import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { WindowImage } from '@/components/window-image';
import {
  type FeatureData,
  getAllFeatureSlugs,
  getFeatureData,
} from '@/lib/features';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const locale = await getAppLocale();
  const data = await getFeatureData(slug, locale);

  if (!data) {
    const t = await getTranslations('pages');
    return {
      title: t('not_found_feature_title'),
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
  const locale = await getAppLocale();
  const pages = await getTranslations('pages');
  const home = await getTranslations('home');
  const data = await getFeatureData(slug, locale);

  if (!data) {
    return notFound();
  }

  const pageUrl = url(localizedHref(`/features/${slug}`, locale));
  const capabilitiesSection = data.capabilities_section ?? {
    title: pages('feature_capabilities_default_title'),
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
      <FeatureHero hero={data.hero} locale={locale} />

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

      <RelatedFeatures locale={locale} related={data.related_features} />

      <div id="faq">
        <FeatureFaq faqs={data.faqs} />
      </div>

      <CtaBanner
        title={pages('compare_cta_title')}
        description={home('cta_description')}
        ctaText={data.cta.label}
        ctaLink={data.cta.href}
      />
    </div>
  );
}
