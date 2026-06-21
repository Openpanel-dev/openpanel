import { BarChart2Icon, CoinsIcon, GithubIcon, ServerIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { getTranslations } from 'next-intl/server';

export async function MixpanelAlternative() {
  const locale = await getAppLocale();
  const t = await getTranslations('home');
  const reasons = [
    {
      icon: CoinsIcon,
      title: t('mixpanel_cost_title'),
      description: t('mixpanel_cost_description'),
    },
    {
      icon: BarChart2Icon,
      title: t('mixpanel_features_title'),
      description: t('mixpanel_features_description'),
    },
    {
      icon: ServerIcon,
      title: t('mixpanel_self_host_title'),
      description: t('mixpanel_self_host_description'),
    },
    {
      icon: GithubIcon,
      title: t('mixpanel_transparent_title'),
      description: t('mixpanel_transparent_description'),
    },
  ];

  return (
    <Section className="container">
      <SectionHeader
        description={t('mixpanel_description')}
        label={t('mixpanel_label')}
        title={t('mixpanel_title')}
      />
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {reasons.map((reason) => (
          <FeatureCard
            description={reason.description}
            icon={reason.icon}
            key={reason.title}
            title={reason.title}
          />
        ))}
      </div>
      <div className="row mt-8 gap-4">
        <GetStartedButton />
        <Button asChild className="px-6" size="lg" variant="outline">
          <Link href={localizedHref('/compare/mixpanel-alternative', locale)}>
            {t('mixpanel_compare_cta')} →
          </Link>
        </Button>
      </div>
    </Section>
  );
}
