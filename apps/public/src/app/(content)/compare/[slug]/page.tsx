import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CompareFaq } from './_components/compare-faq';
import { CompareHero } from './_components/compare-hero';
import { CompareOverview } from './_components/compare-overview';
import { ComparisonTable } from './_components/comparison-table';
import { CompetitorStrengths } from './_components/competitor-strengths';
import { MigrationSection } from './_components/migration-section';
import { PricingSection } from './_components/pricing-section';
import { RelatedLinksSection } from './_components/related-links';
import { Scorecard } from './_components/scorecard';
import { TechnicalComparison } from './_components/technical-comparison';
import { UseCases } from './_components/use-cases';
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
      <CompareHero
        competitor={data.competitor}
        hero={data.hero}
        meta={data.meta}
        summary={data.summary_comparison}
      />

      <Scorecard competitorName={competitorName} highlights={data.highlights} />

      {data.competitor_strengths && (
        <CompetitorStrengths strengths={data.competitor_strengths} />
      )}

      <PricingSection competitorName={competitorName} pricing={data.pricing} />

      {data.overview && <CompareOverview overview={data.overview} />}

      <UseCases useCases={data.use_cases} />

      {data.technical_comparison && (
        <TechnicalComparison
          competitorName={competitorName}
          technical={data.technical_comparison}
        />
      )}

      {data.migration && <MigrationSection migration={data.migration} />}

      <ComparisonTable
        competitorName={competitorName}
        featureComparison={data.feature_comparison}
      />

      <CompareFaq faqs={data.faqs} />

      {data.related_links && (
        <RelatedLinksSection relatedLinks={data.related_links} />
      )}

      <CtaBanner
        ctaLink={data.ctas.primary.href}
        ctaText={data.ctas.primary.label}
        description="Try OpenPanel free for 30 days. You won't be charged unless you pick a paid plan."
        title="Try it on your own data"
      />
    </div>
  );
}
