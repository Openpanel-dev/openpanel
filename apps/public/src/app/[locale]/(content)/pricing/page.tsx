import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { Faq } from '@/app/[locale]/(home)/_sections/faq';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { Pricing } from '@/app/[locale]/(home)/_sections/pricing';
import { Testimonials } from '@/app/[locale]/(home)/_sections/testimonials';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getCompareSource } from '@/lib/source';
import { formatEventsCount } from '@/lib/utils';
import { PRICING } from '@openpanel/payments/prices';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { getTranslations } from 'next-intl/server';
import { localizedHref } from '@/i18n/routing';
import { CompareCard } from '../compare/_components/compare-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('pricing_title'),
    description: t('pricing_description'),
    url: url('/pricing'),
    image: getOgImageUrl('/pricing'),
  });
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'OpenPanel Cloud Pricing',
  description:
    'Our pricing is as simple as it gets, choose how many events you want to track each month, everything else is unlimited, no tiers, no hidden costs.',
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

export default async function SupporterPage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const home = await getTranslations('home');
  const common = await getTranslations('common');

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
          title={t('pricing_title')}
          description={t('pricing_description')}
        />
      </HeroContainer>
      <Pricing />
      <PricingTable t={t} />
      <ComparisonSection locale={locale} t={t} />
      <Testimonials />
      <Faq />
      <CtaBanner
        title={`${home('cta_title_line_1')}\n${home('cta_title_line_2')}`}
        description={home('cta_description')}
        ctaText={common('start_free_trial')}
        ctaLink="https://dashboard.openpanel.dev/onboarding"
      />
    </div>
  );
}

function PricingTable({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <Section className="container">
      <SectionHeader
        title={t('pricing_table_title')}
        description={t('pricing_table_description')}
      />
      <div className="prose mt-8">
        <table className="bg-card">
          <thead>
            <tr>
              <th>{t('pricing_plan')}</th>
              <th className="text-right">{t('pricing_monthly_price')}</th>
              <th className="text-right">{t('pricing_yearly_price')}</th>
            </tr>
          </thead>
          <tbody>
            {PRICING.map((price) => (
              <tr key={price.price}>
                <td className="font-semibold">
                  {formatEventsCount(price.events)}{' '}
                  {t('pricing_events_per_month')}
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

function ComparisonSection({
  locale,
  t,
}: {
  locale: Awaited<ReturnType<typeof getAppLocale>>;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const comparisons = getCompareSource(locale)
    .filter((item) =>
      ['plausible', 'mixpanel', 'google', 'posthog', 'matomo', 'umami'].some(
        (name) => item.competitor.name.toLowerCase().includes(name),
      ),
    )
    .sort((a, b) => a.competitor.name.localeCompare(b.competitor.name));

  return (
    <Section className="container">
      <SectionHeader
        title={t('pricing_compare_title')}
        description={
          <>
            {t('pricing_compare_prefix')}{' '}
            <Link
              href={localizedHref('/articles/self-hosted-web-analytics', locale)}
              className="underline hover:text-primary transition-colors"
            >
              {t('pricing_compare_link')}
            </Link>
            {t('pricing_compare_suffix')}
          </>
        }
      />

      <Button asChild className="mt-8 self-start">
        <Link href={localizedHref('/compare', locale)}>
          {t('pricing_view_all')}
        </Link>
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
        {comparisons.map((comparison) => (
          <CompareCard
            key={comparison.slug}
            url={comparison.url}
            name={`OpenPanel vs ${comparison.competitor.name}`}
            description={comparison.competitor.short_description}
          />
        ))}
      </div>
    </Section>
  );
}
