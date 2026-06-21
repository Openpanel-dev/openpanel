import { FeatureCard } from '@/components/feature-card';
import { ConversionsIllustration } from '@/components/illustrations/conversions';
import { GoogleSearchConsoleIllustration } from '@/components/illustrations/google-search-console';
import { RevenueIllustration } from '@/components/illustrations/revenue';
import { Section, SectionHeader } from '@/components/section';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { getTranslations } from 'next-intl/server';

function wrap(child: React.ReactNode) {
  return <div className="h-48 overflow-hidden">{child}</div>;
}

export async function FeatureSpotlight() {
  const locale = await getAppLocale();
  const t = await getTranslations('home');
  const features = [
    {
      title: t('growth_revenue_title'),
      description: t('growth_revenue_description'),
      illustration: wrap(<RevenueIllustration />),
      link: {
        href: localizedHref('/features/revenue-tracking', locale),
        children: t('growth_revenue_link'),
      },
    },
    {
      title: t('growth_conversion_title'),
      description: t('growth_conversion_description'),
      illustration: wrap(<ConversionsIllustration />),
      link: {
        href: localizedHref('/features/conversion', locale),
        children: t('growth_conversion_link'),
      },
    },
    {
      title: t('growth_gsc_title'),
      description: t('growth_gsc_description'),
      illustration: wrap(<GoogleSearchConsoleIllustration />),
      link: {
        href: localizedHref('/features/integrations', locale),
        children: t('growth_gsc_link'),
      },
    },
  ];

  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description={t('growth_description')}
        label={t('growth_label')}
        title={t('growth_title')}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard
            className="px-0 pt-0 **:data-content:px-6"
            description={feature.description}
            illustration={feature.illustration}
            key={feature.title}
            link={feature.link}
            title={feature.title}
          />
        ))}
      </div>
    </Section>
  );
}
