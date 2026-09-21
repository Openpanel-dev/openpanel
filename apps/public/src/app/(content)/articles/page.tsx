import type { Metadata } from 'next';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { ArticleCard } from '@/components/article-card';
import { Section, SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { articleSource } from '@/lib/source';

export const metadata: Metadata = getPageMetadata({
  title: 'Articles',
  description:
    'Read our latest articles and stay up to date with the latest news and updates.',
  url: url('/articles'),
  image: getOgImageUrl('/articles'),
});

export default async function Page() {
  const articles = (await articleSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  return (
    <div>
      <HeroContainer className="-mb-32">
        <SectionHeader
          align="center"
          as="h1"
          className="flex-1"
          description="Read our latest articles and stay up to date with the latest news and updates."
          title="Articles"
        />
      </HeroContainer>

      <Section className="container grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
        {articles.map((item) => (
          <ArticleCard
            cover={item.data.cover}
            date={item.data.date}
            key={item.url}
            tag={item.data.tag}
            team={item.data.team}
            title={item.data.title}
            url={item.url}
          />
        ))}
      </Section>
      <Testimonials />
      <CtaBanner />
    </div>
  );
}
