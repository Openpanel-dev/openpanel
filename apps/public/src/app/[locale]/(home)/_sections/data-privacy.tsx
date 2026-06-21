import { BoltIcon, GithubIcon, ServerIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { DataOwnershipIllustration } from '@/components/illustrations/data-ownership';
import { PrivacyIllustration } from '@/components/illustrations/privacy';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { getTranslations } from 'next-intl/server';

export async function DataPrivacy() {
  const locale = await getAppLocale();
  const t = await getTranslations('home');
  const secondaryFeatures = [
    {
      title: t('privacy_open_source_title'),
      description: t('privacy_open_source_description'),
      icon: GithubIcon,
    },
    {
      title: t('privacy_self_hosting_title'),
      description: t('privacy_self_hosting_description'),
      icon: ServerIcon,
    },
    {
      title: t('privacy_lightweight_title'),
      description: t('privacy_lightweight_description'),
      icon: BoltIcon,
    },
  ];

  return (
    <Section className="container">
      <SectionHeader
        description={t('privacy_description')}
        title={
          <>
            {t('privacy_title_line_1')}
            <br />
            {t('privacy_title_line_2')}
          </>
        }
      />
      <div className="mt-16 mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          description={t('privacy_gdpr_description')}
          illustration={<PrivacyIllustration />}
          title={t('privacy_gdpr_title')}
          variant="large"
        />
        <FeatureCard
          description={t('privacy_ownership_description')}
          illustration={<DataOwnershipIllustration />}
          title={t('privacy_ownership_title')}
          variant="large"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {secondaryFeatures.map((feature) => (
          <FeatureCard
            description={feature.description}
            icon={feature.icon}
            key={feature.title}
            title={feature.title}
          />
        ))}
      </div>
      <div className="row mt-8 gap-4">
        <GetStartedButton />
        <Button asChild className="px-6" size="lg" variant="outline">
          <Link href={localizedHref('/docs/self-hosting/self-hosting', locale)}>
            {t('privacy_self_host_cta')}
          </Link>
        </Button>
      </div>
    </Section>
  );
}
