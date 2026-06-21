import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { NotificationsIllustration } from '@/components/illustrations/notifications';
import { ProductAnalyticsIllustration } from '@/components/illustrations/product-analytics';
import { RetentionIllustration } from '@/components/illustrations/retention';
import { SessionReplayIllustration } from '@/components/illustrations/session-replay';
import { WebAnalyticsIllustration } from '@/components/illustrations/web-analytics';
import { Section, SectionHeader } from '@/components/section';
import { getAppLocale } from '@/i18n/server';
import { localizedHref } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

function wrap(child: React.ReactNode) {
  return <div className="h-48 overflow-hidden">{child}</div>;
}

export async function AnalyticsInsights() {
  const locale = await getAppLocale();
  const t = await getTranslations('home');
  const mediumFeatures = [
    {
      title: t('insights_retention_title'),
      description: t('insights_retention_description'),
      illustration: wrap(<RetentionIllustration />),
      link: {
        href: localizedHref('/features/retention', locale),
        children: t('insights_retention_link'),
      },
    },
    {
      title: t('insights_replay_title'),
      description: t('insights_replay_description'),
      illustration: wrap(<SessionReplayIllustration />),
      link: {
        href: localizedHref('/features/session-replay', locale),
        children: t('insights_replay_link'),
      },
    },
    {
      title: t('insights_notifications_title'),
      description: t('insights_notifications_description'),
      illustration: wrap(<NotificationsIllustration />),
      link: {
        href: localizedHref('/features/notifications', locale),
        children: t('insights_notifications_link'),
      },
    },
  ];

  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description={t('insights_description')}
        label={t('insights_label')}
        title={t('insights_title')}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description={t('insights_web_description')}
          illustration={<WebAnalyticsIllustration />}
          title={t('insights_web_title')}
        />
        <FeatureCard
          className="px-0 **:data-content:px-6"
          description={t('insights_product_description')}
          illustration={<ProductAnalyticsIllustration />}
          title={t('insights_product_title')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {mediumFeatures.map((feature) => (
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

      <p className="mt-8 text-center">
        <Link
          className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href={localizedHref('/features', locale)}
        >
          {t('insights_explore_all')}
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </p>
    </Section>
  );
}
