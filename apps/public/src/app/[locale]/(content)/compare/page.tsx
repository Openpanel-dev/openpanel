import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { Section, SectionHeader } from '@/components/section';
import { WindowImage } from '@/components/window-image';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getCompareSource } from '@/lib/source';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CompareHero } from './[slug]/_components/compare-hero';
import { CompareCard } from './_components/compare-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('compare_title'),
    description: t('compare_description'),
    url: url('/compare'),
    image: getOgImageUrl('/compare'),
  });
}

export default async function CompareIndexPage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const common = await getTranslations('common');
  const comparisons = getCompareSource(locale).sort((a, b) =>
    a.competitor.name.localeCompare(b.competitor.name),
  );
  const heroData = {
    heading: t('compare_hero_heading'),
    subheading: t('compare_hero_subheading'),
    badges: [t('compare_badge_1'), t('compare_badge_2'), t('compare_badge_3')],
  };

  return (
    <div>
      <CompareHero hero={heroData} />

      <div className="container my-16">
        <WindowImage
          srcDark="/screenshots/overview-dark.png"
          srcLight="/screenshots/overview-light.png"
          alt={t('compare_dashboard_alt')}
          caption={t('compare_dashboard_caption')}
        />
      </div>

      <Section className="container">
        <SectionHeader
          title={t('compare_all_title')}
          description={t('compare_all_description')}
          variant="sm"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {comparisons.map((comparison) => (
            <CompareCard
              key={comparison.slug}
              url={comparison.url}
              name={comparison.competitor.name}
              description={comparison.competitor.short_description}
            />
          ))}
        </div>
      </Section>

      <CtaBanner
        title={t('compare_cta_title')}
        description={t('compare_cta_description')}
        ctaText={common('get_started_free')}
        ctaLink="https://dashboard.openpanel.dev/onboarding"
      />
    </div>
  );
}
