import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { Testimonials } from '@/app/[locale]/(home)/_sections/testimonials';
import { GuideCard } from '@/components/guide-card';
import { Section, SectionHeader } from '@/components/section';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getGuidePages } from '@/lib/source';
import type { Metadata } from 'next';
import Script from 'next/script';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('guides_title'),
    description: t('guides_description'),
    url: url('/guides'),
    image: getOgImageUrl('/guides'),
  });
}

export default async function Page() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const home = await getTranslations('home');
  const common = await getTranslations('common');
  const guides = getGuidePages(locale).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  // Create ItemList schema for SEO
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('guides_schema_name'),
    description: t('guides_schema_description'),
    itemListElement: guides.map((guide, index) => {
      const slug = guide.url.replace(/^\/guides\//, '').replace(/\/$/, '');
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: guide.data.title,
        url: url(guide.url),
      };
    }),
  };

  return (
    <div>
      <HeroContainer className="-mb-32">
        <SectionHeader
          as="h1"
          align="center"
          className="flex-1"
          title={t('guides_title')}
          description={t('guides_description')}
        />
      </HeroContainer>

      <Script
        strategy="beforeInteractive"
        id="guides-itemlist-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <Section className="container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
        {guides.map((item) => (
          <GuideCard
            key={item.url}
            url={item.url}
            title={item.data.title}
            difficulty={item.data.difficulty}
            timeToComplete={item.data.timeToComplete}
            cover={item.data.cover}
            team={item.data.team}
            date={item.data.date}
          />
        ))}
      </Section>
      <Testimonials />
      <CtaBanner
        title={`${home('cta_title_line_1')}\n${home('cta_title_line_2')}`}
        description={home('cta_description')}
        ctaText={common('start_free_trial')}
        ctaLink="https://dashboard.openpanel.dev/onboarding"
      />
    </div>
  );
}
