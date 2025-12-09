import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { ArticleCard } from '@/components/article-card';
import { Section, SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { articleSource } from '@/lib/source';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = getPageMetadata({
  title: 'Articles',
  description:
    'Read our latest articles and stay up to date with the latest news and updates.',
  url: url('/articles'),
  image: getOgImageUrl('/articles'),
});

export default async function Page() {
  const articles = (await articleSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return (
    <div>
      <HeroContainer className="-mb-32">
        <SectionHeader
          as="h1"
          align="center"
          className="flex-1"
          title="Articles"
          description="Read our latest articles and stay up to date with the latest news and updates."
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
      <CtaBanner />
    </div>
  );
}
