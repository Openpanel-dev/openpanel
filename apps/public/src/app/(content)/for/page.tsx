import type { Metadata } from 'next';
import { AUDIENCE_HERO } from './[slug]/_components/for-visuals';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { CardGrid } from '@/components/blocks/card-grid';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { VisualMock, type VisualMockName } from '@/components/visual-mock';
import { getAllForSlugs, getForData } from '@/lib/for';
import { getPageMetadata } from '@/lib/metadata';

export function generateMetadata(): Metadata {
  return getPageMetadata({
    title: 'OpenPanel for Your Use Case',
    description:
      'Discover how OpenPanel helps startups, developers, and agencies with privacy-first, open-source web and product analytics.',
    url: '/for',
  });
}

// The small replica on each card; falls back to the page's hero view.
const AUDIENCE_MINI: Record<string, VisualMockName> = {
  startups: 'mini-funnel',
  saas: 'mini-retention',
  agencies: 'mini-share-toggle',
  developers: 'mini-sdk-list',
  ecommerce: 'mini-revenue',
  shopify: 'mini-event-rows',
  'gdpr-compliant': 'mini-session-search',
  nextjs: 'mini-screen-views',
  wordpress: 'mini-devices',
};

const ORDER = [
  'startups',
  'saas',
  'developers',
  'agencies',
  'ecommerce',
  'shopify',
  'nextjs',
  'wordpress',
  'gdpr-compliant',
];

export default async function ForListPage() {
  const slugs = await getAllForSlugs();
  const pages = (await Promise.all(slugs.map((slug) => getForData(slug))))
    .filter((page): page is NonNullable<typeof page> => page !== null)
    .sort((a, b) => ORDER.indexOf(a.audience) - ORDER.indexOf(b.audience));

  return (
    <div>
      <FeatureHero
        description="The same product, read through the questions each team asks. Pick the page closest to yours."
        title="OpenPanel for your use case"
        visual={<VisualMock name="web-overview" />}
      />
      <CardGrid
        items={pages.map((page) => ({
          title: page.hero.heading,
          description: page.seo.description,
          href: page.url,
          visual: (
            <VisualMock
              frame="bare"
              name={
                AUDIENCE_MINI[page.audience] ??
                AUDIENCE_HERO[page.audience] ??
                'mini-realtime'
              }
            />
          ),
        }))}
      />
      <CtaBanner
        ctaLink="https://dashboard.openpanel.dev/onboarding"
        ctaText="Start free trial"
      />
    </div>
  );
}
