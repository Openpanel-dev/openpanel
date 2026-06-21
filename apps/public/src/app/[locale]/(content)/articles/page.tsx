import { CtaBanner } from '@/app/[locale]/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { Testimonials } from '@/app/[locale]/(home)/_sections/testimonials';
import { ArticleCard } from '@/components/article-card';
import { Section, SectionHeader } from '@/components/section';
import { getAppLocale } from '@/i18n/server';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getArticlePages } from '@/lib/source';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('articles_title'),
    description: t('articles_description'),
    url: url('/articles'),
    image: getOgImageUrl('/articles'),
  });
}

export default async function Page() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const home = await getTranslations('home');
  const common = await getTranslations('common');
  const articles = getArticlePages(locale).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return (
    <div>
      <HeroContainer className="-mb-32">
        <SectionHeader
          as="h1"
          align="center"
          className="flex-1"
          title={t('articles_title')}
          description={t('articles_description')}
        />
      </HeroContainer>

      <Section className="container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
        {articles.map((item) => (
          <ArticleCard
            key={item.url}
            url={item.url}
            title={item.data.title}
            tag={item.data.tag}
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
