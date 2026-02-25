import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { ForBenefits } from './_components/for-benefits';
import { ForFaq } from './_components/for-faq';
import { ForFeatures } from './_components/for-features';
import { ForHero } from './_components/for-hero';
import { ForProblem } from './_components/for-problem';
import { ForRelatedLinksSection } from './_components/for-related-links';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { WindowImage } from '@/components/window-image';
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
      <ForHero hero={data.hero} />

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Dashboard Overview"
          caption="This is our web analytics dashboard, its an out-of-the-box experience so you can start understanding your traffic and engagement right away."
          srcDark="/screenshots/overview-dark.webp"
          srcLight="/screenshots/overview-light.webp"
        />
      </div>

      <div id="problem">
        <ForProblem problem={data.problem} />
      </div>

      <div id="features">
        <ForFeatures features={data.features} />
      </div>

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Real-time Analytics"
          caption="Track events in real-time as they happen with instant updates and live monitoring."
          srcDark="/screenshots/realtime-dark.webp"
          srcLight="/screenshots/realtime-light.webp"
        />
      </div>

      <div id="benefits">
        <ForBenefits benefits={data.benefits} />
      </div>

      <div className="container my-16">
        <WindowImage
          alt="OpenPanel Dashboard"
          caption="Comprehensive analytics dashboard with real-time insights and customizable views."
          srcDark="/screenshots/dashboard-dark.webp"
          srcLight="/screenshots/dashboard-light.webp"
        />
      </div>

      <div id="faq">
        <ForFaq faqs={data.faqs} />
      </div>

      {data.related_links && (
        <ForRelatedLinksSection relatedLinks={data.related_links} />
      )}

      <CtaBanner
        ctaLink={data.ctas.primary.href}
        ctaText={data.ctas.primary.label}
        description="Test OpenPanel free for 30 days, you'll not be charged anything unless you upgrade to a paid plan."
        title="Ready to get started?"
      />
    </div>
  );
}
