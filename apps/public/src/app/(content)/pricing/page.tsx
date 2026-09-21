import { PRICING } from '@openpanel/payments/prices';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { CompareCard } from '../compare/_components/compare-card';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Faq } from '@/app/(home)/_sections/faq';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Pricing } from '@/app/(home)/_sections/pricing';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { compareSource } from '@/lib/source';
import { formatEventsCount } from '@/lib/utils';

const title = 'OpenPanel Cloud Pricing';
const description =
  'Our pricing is as simple as it gets, choose how many events you want to track each month, everything else is unlimited, no tiers, no hidden costs.';

export const metadata: Metadata = getPageMetadata({
  title,
  description,
  url: url('/pricing'),
  image: getOgImageUrl('/pricing'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  description,
  url: url('/pricing'),
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
};

export default function SupporterPage() {
  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="pricing-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer className="-mb-32">
        <SectionHeader
          align="center"
          as="h1"
          className="flex-1"
          description={description}
          title={title}
        />
      </HeroContainer>
      <Pricing />
      <PricingTable />
      <ComparisonSection />
      <Testimonials />
      <Faq />
      <CtaBanner />
    </div>
  );
}

function PricingTable() {
  return (
    <Section className="container">
      <SectionHeader
        description="Here's the full pricing table for all plans. You can use the discount code to get a discount on your subscription."
        title="Full pricing table"
      />
      <div className="prose mt-8">
        <table className="bg-card">
          <thead>
            <tr>
              <th>Plan</th>
              <th className="text-right">Monthly price</th>
              <th className="text-right">Yearly price (2 months free)</th>
            </tr>
          </thead>
          <tbody>
            {PRICING.map((price) => (
              <tr key={price.price}>
                <td className="font-semibold">
                  {formatEventsCount(price.events)} events per month
                </td>
                <td className="text-right">
                  {Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(price.price)}
                </td>
                <td className="text-right">
                  {Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(price.price * 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ComparisonSection() {
  const comparisons = compareSource
    .filter((item) =>
      ['plausible', 'mixpanel', 'google', 'posthog', 'matomo', 'umami'].some(
        (name) => item.competitor.name.toLowerCase().includes(name)
      )
    )
    .sort((a, b) => a.competitor.name.localeCompare(b.competitor.name));

  return (
    <Section className="container">
      <SectionHeader
        description={
          <>
            See how OpenPanel stacks up against other analytics tools in our{' '}
            <Link
              className="underline transition-colors hover:text-primary"
              href="/articles/self-hosted-web-analytics"
            >
              comprehensive comparison of open source web analytics tools
            </Link>
            .
          </>
        }
        title="How do we compare?"
      />

      <Button asChild className="mt-8 self-start">
        <Link href="/compare">View all comparisons</Link>
      </Button>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comparisons.map((comparison) => (
          <CompareCard
            description={comparison.competitor.short_description}
            key={comparison.slug}
            name={`OpenPanel vs ${comparison.competitor.name}`}
            url={comparison.url}
          />
        ))}
      </div>
    </Section>
  );
}
