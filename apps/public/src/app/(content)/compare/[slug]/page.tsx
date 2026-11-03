import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CategoryPillars } from './_components/category-pillars';
import { CompareFaq } from './_components/compare-faq';
import { CompareHero } from './_components/compare-hero';
import { CompareOverview } from './_components/compare-overview';
import { CompetitorStrengths } from './_components/competitor-strengths';
import { FeatureTable } from './_components/feature-table';
import { MigrationBand } from './_components/migration-band';
import { PricingCompare } from './_components/pricing-compare';
import { RelatedLinksSection } from './_components/related-links';
import { Scoreboard } from './_components/scoreboard';
import { TechnicalComparison } from './_components/technical-comparison';
import { UseCases } from './_components/use-cases';
import { Verdict } from './_components/verdict';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import type { CompareData } from '@/lib/compare';
import { getAllCompareSlugs, getCompareData } from '@/lib/compare';
import { getAuthor, url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

export async function generateStaticParams() {
  const slugs = await getAllCompareSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCompareData(slug);

  if (!data) {
    return {
      title: 'Comparison Not Found',
    };
  }

  return getPageMetadata({
    title: data.seo.title,
    description: data.seo.description,
    url: data.url,
    image: getOgImageUrl(data.url),
  });
}

function buildJsonLd(data: CompareData, pageUrl: string) {
  const author = data.meta ? getAuthor(data.meta.author) : undefined;
  const article = {
    '@type': 'Article',
    headline: data.seo.title,
    description: data.seo.description,
    url: pageUrl,
    ...(data.meta && { dateModified: data.meta.updated }),
    ...(author && {
      author: { '@type': 'Person', name: author.name, url: author.url },
    }),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: { '@type': 'ImageObject', url: url('/logo.png') },
    },
  };
  const faqPage = {
    '@type': 'FAQPage',
    mainEntity: data.faqs.items.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
  return { '@context': 'https://schema.org', '@graph': [article, faqPage] };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCompareData(slug);

  if (!data) {
    return notFound();
  }

  const competitorName = data.competitor.name;
  const competitorSlug = slug.replace(/-alternative$/, '');

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(data, url(data.url))),
        }}
        id="compare-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <CompareHero competitorSlug={competitorSlug} data={data} />
      <Verdict
        competitorName={competitorName}
        meta={data.meta}
        summary={data.summary_comparison}
      />
      <Scoreboard
        competitorName={competitorName}
        competitorSlug={competitorSlug}
        highlights={data.highlights}
      />
      <CategoryPillars
        category={data.category}
        competitorName={competitorName}
      />
      <UseCases useCases={data.use_cases} />
      {data.competitor_strengths && (
        <CompetitorStrengths strengths={data.competitor_strengths} />
      )}
      <PricingCompare
        competitorName={competitorName}
        competitorSlug={competitorSlug}
        pricing={data.pricing}
      />
      <FeatureTable
        competitorName={competitorName}
        competitorSlug={competitorSlug}
        featureComparison={data.feature_comparison}
      />
      {data.technical_comparison && (
        <TechnicalComparison
          competitorName={competitorName}
          competitorSlug={competitorSlug}
          technical={data.technical_comparison}
        />
      )}
      {data.migration && (
        <MigrationBand
          competitorName={competitorName}
          migration={data.migration}
        />
      )}
      {data.overview && <CompareOverview overview={data.overview} />}
      <CompareFaq faqs={data.faqs} />
      <RelatedLinksSection relatedLinks={data.related_links} />
      <CtaBanner
        ctaLink={data.ctas.primary.href}
        ctaText={data.ctas.primary.label}
        description={`The steps above are what switching from ${competitorName} takes. 30-day free trial on Cloud, or self-host for free.`}
        title="Try it on your own data"
      />
    </div>
  );
}
