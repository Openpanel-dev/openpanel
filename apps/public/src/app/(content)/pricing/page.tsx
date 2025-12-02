import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Faq } from '@/app/(home)/_sections/faq';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Pricing } from '@/app/(home)/_sections/pricing';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { Section, SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { formatEventsCount } from '@/lib/utils';
import { PRICING } from '@openpanel/payments/prices';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';

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
  description: description,
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
        id="pricing-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroContainer className="-mb-32">
        <SectionHeader
          as="h1"
          align="center"
          className="flex-1"
          title={title}
          description={description}
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
        title="Full pricing table"
        description="Here's the full pricing table for all plans. You can use the discount code to get a discount on your subscription."
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
  return (
    <Section className="container">
      <SectionHeader
        title="How do we compare?"
        description={
          <>
            See how OpenPanel stacks up against other analytics tools in our{' '}
            <Link
              href="/articles/open-source-web-analytics"
              className="underline hover:text-primary transition-colors"
            >
              comprehensive comparison of open source web analytics tools
            </Link>
            .
          </>
        }
      />
    </Section>
  );
}
