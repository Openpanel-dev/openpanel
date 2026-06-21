import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { SupporterPerks } from 'components/sections/supporter-perks';
import {
  ClockIcon,
  GithubIcon,
  InfinityIcon,
  MessageSquareIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  ZapIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Script from 'next/script';

const supporterUrl =
  'https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('supporter_title'),
    description: t('supporter_description'),
    url: url('/supporter'),
    image: getOgImageUrl('/supporter'),
  });
}

export default async function SupporterPage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const card = (key: string) => ({
    title: t(`supporter_cards_${key}_title`),
    description: t(`supporter_cards_${key}_description`),
  });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('supporter_title'),
    description: t('supporter_description'),
    url: url('/supporter'),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.png'),
      },
    },
  };

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="supporter-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer>
        <div className="col center-center flex-1">
          <SectionHeader
            align="center"
            as="h1"
            className="flex-1"
            description={t('supporter_hero_description')}
            title={
              <>
                {t('supporter_hero_title_line_1')}
                <br />
                {t('supporter_hero_title_line_2')}
              </>
            }
          />
          <div className="col mt-8 items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href={supporterUrl}>
                {t('supporter_cta')}
                <SparklesIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              {t('supporter_price_note')}
            </p>
          </div>
        </div>
      </HeroContainer>

      <div className="container">
        <div className="mb-16 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="col gap-16">
            <Section className="my-0">
              <SectionHeader
                description={t('supporter_why_description')}
                title={t('supporter_why_title')}
              />
              <div className="col mt-8 gap-6">
                <p className="text-muted-foreground">
                  {t('supporter_funding_intro')}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <FeatureCard icon={ZapIcon} {...card('active_development')} />
                  <FeatureCard icon={ZapIcon} {...card('infrastructure')} />
                  <FeatureCard icon={ZapIcon} {...card('independence')} />
                </div>
                <p className="text-muted-foreground">
                  {t('supporter_funding_outro')}
                </p>
              </div>
            </Section>

            <Section className="my-0">
              <SectionHeader
                description={t('supporter_what_description')}
                title={t('supporter_what_title')}
              />
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <FeatureCard icon={RocketIcon} {...card('latest_docker')}>
                  <Link
                    className="mt-2 text-primary text-sm hover:underline"
                    href={localizedHref(
                      '/docs/self-hosting/supporter-access-latest-docker-images',
                      locale,
                    )}
                  >
                    {t('supporter_learn_more')}
                  </Link>
                </FeatureCard>
                <FeatureCard
                  icon={MessageSquareIcon}
                  {...card('priority_support')}
                />
                <FeatureCard
                  icon={SparklesIcon}
                  {...card('feature_requests')}
                />
                <FeatureCard icon={StarIcon} {...card('discord_role')} />
              </div>
            </Section>

            <Section className="my-0">
              <SectionHeader
                description={t('supporter_impact_description')}
                title={t('supporter_impact_title')}
              />
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <FeatureCard icon={GithubIcon} {...card('open_source')} />
                <FeatureCard icon={ClockIcon} {...card('active247')} />
                <FeatureCard icon={InfinityIcon} {...card('self_hostable')} />
              </div>
            </Section>
          </div>

          <aside className="hidden lg:block">
            <SupporterPerks locale={locale} />
          </aside>
        </div>

        <div className="mb-16 lg:hidden">
          <SupporterPerks locale={locale} />
        </div>

        <CtaBanner
          ctaLink={supporterUrl}
          ctaText={t('supporter_cta')}
          description={t('supporter_final_description')}
          title={t('supporter_final_title')}
        />
      </div>
    </div>
  );
}
