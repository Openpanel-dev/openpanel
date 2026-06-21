import type { LucideIcon } from 'lucide-react';
import {
  BellIcon,
  ConeIcon,
  DollarSignIcon,
  FilterIcon,
  GlobeIcon,
  MonitorIcon,
  MousePointerClickIcon,
  PieChartIcon,
  RefreshCwIcon,
  ShareIcon,
  UserIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import { FeatureCardLink } from './_components/feature-card';
import { FeatureHero } from '@/app/[locale]/(content)/features/[slug]/_components/feature-hero';
import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { Section, SectionHeader } from '@/components/section';
import { WindowImage } from '@/components/window-image';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getFeatureSource } from '@/lib/source';
import { getTranslations } from 'next-intl/server';

const featureIcons: Record<string, LucideIcon> = {
  conversion: FilterIcon,
  'data-visualization': PieChartIcon,
  'event-tracking': MousePointerClickIcon,
  funnels: ConeIcon,
  'identify-users': UserIcon,
  integrations: WorkflowIcon,
  notifications: BellIcon,
  retention: RefreshCwIcon,
  'revenue-tracking': DollarSignIcon,
  'session-tracking': MonitorIcon,
  'share-and-collaborate': ShareIcon,
  'web-analytics': GlobeIcon,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('features_title'),
    description: t('features_description'),
    url: url('/features'),
    image: getOgImageUrl('/features'),
  });
}

export default async function FeaturesIndexPage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const common = await getTranslations('common');
  const features = getFeatureSource(locale);
  const heroData = {
    heading: t('features_hero_heading'),
    subheading: t('features_hero_subheading'),
    badges: [t('features_badge_1'), t('features_badge_2'), t('features_badge_3')],
  };

  return (
    <div>
      <FeatureHero hero={heroData} locale={locale} />

      <div className="container my-16">
        <WindowImage
          alt={t('features_dashboard_alt')}
          caption={t('features_dashboard_caption')}
          srcDark="/screenshots/overview-dark.webp"
          srcLight="/screenshots/overview-light.webp"
        />
      </div>

      <Section className="container">
        <SectionHeader
          description={t('features_all_description')}
          title={t('features_all_title')}
          variant="sm"
        />
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {features.map((feature) => (
            <FeatureCardLink
              description={feature.hero.subheading}
              icon={featureIcons[feature.slug]}
              key={feature.slug}
              title={feature.hero.heading}
              url={feature.url}
            />
          ))}
        </div>
      </Section>

      <CtaBanner
        ctaLink="https://dashboard.openpanel.dev/onboarding"
        ctaText={common('get_started_free')}
        description={t('compare_cta_description')}
        title={t('compare_cta_title')}
      />
    </div>
  );
}
