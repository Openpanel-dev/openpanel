import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { BenefitsSection } from './_components/benefits-section';
import { CompareFaq } from './_components/compare-faq';
import { CompareHero } from './_components/compare-hero';
import { CompareOverview } from './_components/compare-overview';
import { ComparisonTable } from './_components/comparison-table';
import { FeaturesShowcase } from './_components/features-showcase';
import { MigrationSection } from './_components/migration-section';
import { PricingSection } from './_components/pricing-section';
import { RelatedLinksSection } from './_components/related-links';
import { TechnicalComparison } from './_components/technical-comparison';
import { UseCases } from './_components/use-cases';
import { WhoShouldChoose } from './_components/who-should-choose';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { WindowImage } from '@/components/window-image';
import { getAllCompareSlugs, getCompareData } from '@/lib/compare';
import { url } from '@/lib/layout.shared';
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

  const pageUrl = url(`/compare/${slug}`);

  // Create JSON-LD schema
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

  // Build ToC items
  const tocItems = [
    ...(data.overview ? [{ id: 'overview', label: data.overview.title }] : []),
    { id: 'who-should-choose', label: data.summary_comparison.title },
    { id: 'comparison', label: data.highlights.title },
    { id: 'features', label: data.feature_comparison.title },
    ...(data.technical_comparison
      ? [{ id: 'technical', label: data.technical_comparison.title }]
      : []),
    { id: 'pricing', label: data.pricing.title },
    ...(data.migration
      ? [{ id: 'migration', label: data.migration.title }]
      : []),
    { id: 'use-cases', label: data.use_cases.title },
    ...(data.benefits_section
      ? [{ id: 'benefits', label: data.benefits_section.title }]
      : []),
    { id: 'faq', label: data.faqs.title },
  ];

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="compare-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <CompareHero hero={data.hero} tocItems={tocItems} />

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Dashboard Overview"
          caption="This is our web analytics dashboard, its an out-of-the-box experience so you can start understanding your traffic and engagement right away."
          srcDark="/screenshots/overview-dark.webp"
          srcLight="/screenshots/overview-light.webp"
        />
      </div>

      {data.overview && (
        <div id="overview">
          <CompareOverview overview={data.overview} />
        </div>
      )}

      <div id="who-should-choose">
        <WhoShouldChoose
          competitorName={data.competitor.name}
          summary={data.summary_comparison}
        />
      </div>

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Dashboard"
          caption="Comprehensive analytics dashboard with real-time insights and customizable views."
          srcDark="/screenshots/dashboard-dark.webp"
          srcLight="/screenshots/dashboard-light.webp"
        />
      </div>

      <div id="comparison">
        <ComparisonTable
          competitorName={data.competitor.name}
          featureComparison={data.feature_comparison}
          highlights={data.highlights}
        />
      </div>
      <div id="features">
        <FeaturesShowcase featureComparison={data.feature_comparison} />
      </div>

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Real-time Analytics"
          caption="Track events in real-time as they happen with instant updates and live monitoring."
          srcDark="/screenshots/realtime-dark.webp"
          srcLight="/screenshots/realtime-light.webp"
        />
      </div>

      {data.technical_comparison && (
        <div id="technical">
          <TechnicalComparison
            competitorName={data.competitor.name}
            technical={data.technical_comparison}
          />
        </div>
      )}

      <div id="pricing">
        <PricingSection
          competitorName={data.competitor.name}
          pricing={data.pricing}
        />
      </div>

      {data.migration && (
        <div id="migration">
          <MigrationSection migration={data.migration} />
        </div>
      )}

      <div id="use-cases">
        <UseCases useCases={data.use_cases} />
      </div>

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Reports"
          caption="Generate detailed reports and insights with customizable metrics and visualizations."
          srcDark="/screenshots/report-dark.webp"
          srcLight="/screenshots/report-light.webp"
        />
      </div>

      {data.benefits_section && (
        <>
          <div id="benefits">
            <BenefitsSection
              benefits={data.benefits_section.benefits}
              cta={data.benefits_section.cta}
              description={data.benefits_section.description}
              label={data.benefits_section.label}
              title={data.benefits_section.title}
            />
          </div>
          <div className="container my-16">
            <WindowImage
              alt="OpenPanel User Profiles"
              caption="Deep dive into individual user profiles with complete event history and behavior tracking."
              srcDark="/screenshots/profile-dark.webp"
              srcLight="/screenshots/profile-light.webp"
            />
          </div>
        </>
      )}

      <div id="faq">
        <CompareFaq faqs={data.faqs} />
      </div>

      {data.related_links && (
        <RelatedLinksSection relatedLinks={data.related_links} />
      )}

      <CtaBanner
        ctaLink={data.ctas.primary.href}
        ctaText={data.ctas.primary.label}
        description="Test OpenPanel free for 30 days, you'll not be charged anything unless you upgrade to a paid plan."
        title={'Ready to make the switch?'}
      />
    </div>
  );
}
