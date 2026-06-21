import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import {
  BarChartIcon,
  CheckIcon,
  CodeIcon,
  GlobeIcon,
  HeartHandshakeIcon,
  LinkIcon,
  MailIcon,
  MessageSquareIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Script from 'next/script';

const applyHref =
  'mailto:oss@openpanel.dev?subject=Open Source Program Application';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('open_source_title'),
    description: t('open_source_description'),
    url: url('/open-source'),
    image: getOgImageUrl('/open-source'),
  });
}

export default async function OpenSourcePage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const card = (key: string) => ({
    title: t(`open_source_cards_${key}_title`),
    description: t(`open_source_cards_${key}_description`),
  });
  const faqItems = Array.from({ length: 6 }, (_, index) => {
    const n = index + 1;
    return {
      question: t(`open_source_faq_${n}_question`),
      answer: t(`open_source_faq_${n}_answer`),
    };
  });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('open_source_title'),
    description: t('open_source_description'),
    url: url('/open-source'),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.png'),
      },
    },
    mainEntity: {
      '@type': 'Offer',
      name: t('open_source_title'),
      description: t('open_source_description'),
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="open-source-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer>
        <div className="col center-center flex-1">
          <SectionHeader
            align="center"
            as="h1"
            className="flex-1"
            description={t('open_source_hero_description')}
            title={
              <>
                {t('open_source_hero_title_line_1')}
                <br />
                {t('open_source_hero_title_line_2')}
              </>
            }
          />
          <div className="col mt-8 items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="mailto:oss@openpanel.dev">
                {t('open_source_apply')}
                <MailIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              {t('open_source_note')}
            </p>
          </div>
        </div>
      </HeroContainer>

      <div className="container">
        <div className="col gap-16">
          <Section className="my-0">
            <SectionHeader
              description={t('open_source_what_description')}
              title={t('open_source_what_title')}
            />
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <FeatureCard icon={BarChartIcon} {...card('events')} />
              <FeatureCard icon={ZapIcon} {...card('feature_access')} />
              <FeatureCard icon={UsersIcon} {...card('team')} />
              <FeatureCard icon={MessageSquareIcon} {...card('support')} />
            </div>
          </Section>

          <Section className="my-0">
            <SectionHeader
              description={t('open_source_why_description')}
              title={t('open_source_why_title')}
            />
            <div className="col mt-8 gap-6">
              <p className="text-muted-foreground">
                {t('open_source_why_body')}
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <FeatureCard icon={CodeIcon} {...card('built_for_oss')} />
                <FeatureCard
                  icon={HeartHandshakeIcon}
                  {...card('no_barriers')}
                />
                <FeatureCard icon={SparklesIcon} {...card('giving_back')} />
              </div>
            </div>
          </Section>

          <Section className="my-0">
            <SectionHeader
              description={t('open_source_ask_description')}
              title={t('open_source_ask_title')}
            />
            <div className="row mt-8 gap-6">
              <div className="col gap-6">
                <FeatureCard icon={LinkIcon} {...card('backlink')}>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {t('open_source_backlink_example_prefix')}{' '}
                    <Link
                      className="text-primary hover:underline"
                      href="https://openpanel.dev"
                    >
                      OpenPanel
                    </Link>
                    "
                  </p>
                </FeatureCard>
                <FeatureCard icon={GlobeIcon} {...card('widget')}>
                  <a
                    href="https://openpanel.dev"
                    style={{
                      display: 'inline-block',
                      overflow: 'hidden',
                      borderRadius: '8px',
                      width: '250px',
                      height: '48px',
                    }}
                  >
                    <iframe
                      height="48"
                      src="https://dashboard.openpanel.dev/widget/badge?shareId=ancygl&color=%231F1F1F"
                      style={{
                        border: 'none',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                      title="OpenPanel Analytics Badge"
                      width="100%"
                    />
                  </a>
                </FeatureCard>
                <p className="text-muted-foreground">
                  {t('open_source_ask_outro')}
                </p>
              </div>
              <div>
                <div className="text-center text-muted-foreground text-xs">
                  <iframe
                    className="mb-2 rounded-xl border"
                    height="400"
                    src="https://dashboard.openpanel.dev/widget/realtime?shareId=26wVGY"
                    title="Realtime Widget"
                    width="300"
                  />
                  {t('open_source_analytics_from')}{' '}
                  <a className="underline" href="https://openpanel.dev">
                    OpenPanel.dev
                  </a>
                </div>
              </div>
            </div>
          </Section>

          <Section className="my-0">
            <SectionHeader
              description={t('open_source_eligibility_description')}
              title={t('open_source_eligibility_title')}
            />
            <div className="col mt-8 gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                {['license', 'repo', 'active', 'non_commercial'].map((key) => {
                  const item = card(key);
                  return (
                    <div className="flex gap-3" key={key}>
                      <CheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div>
                        <h3 className="mb-1 font-semibold">{item.title}</h3>
                        <p className="text-muted-foreground text-sm">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section className="my-0">
            <SectionHeader
              description={t('open_source_apply_description')}
              title={t('open_source_apply_title')}
            />
            <div className="col mt-8 gap-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    1
                  </div>
                  <h3 className="font-semibold">{card('email').title}</h3>
                  <p className="text-muted-foreground text-sm">
                    <Link
                      className="text-primary hover:underline"
                      href="mailto:oss@openpanel.dev"
                    >
                      oss@openpanel.dev
                    </Link>{' '}
                    {card('email').description}
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    2
                  </div>
                  <h3 className="font-semibold">{card('info').title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {card('info').description}
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    3
                  </div>
                  <h3 className="font-semibold">{card('review').title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {card('review').description}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button asChild size="lg">
                  <Link href={applyHref}>
                    {t('open_source_apply_now')}
                    <MailIcon className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Section>

          <Section className="my-0">
            <SectionHeader
              description={t('open_source_faq_description')}
              title={t('open_source_faq_title')}
            />
            <div className="mt-8">
              <Faqs>
                {faqItems.map((item) => (
                  <FaqItem key={item.question} question={item.question}>
                    {item.answer}
                  </FaqItem>
                ))}
              </Faqs>
            </div>
          </Section>

          <CtaBanner
            ctaLink={applyHref}
            ctaText={t('open_source_apply')}
            description={t('open_source_final_description')}
            title={t('open_source_final_title')}
          />
        </div>
      </div>
    </div>
  );
}
