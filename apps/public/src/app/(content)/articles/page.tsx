import type { Metadata } from 'next';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { ArticleCard } from '@/components/article-card';
import { SectionHeader } from '@/components/section';
import { resolveArticleCover } from '@/lib/article-cover';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { articleSource } from '@/lib/source';

export const metadata: Metadata = getPageMetadata({
  title: 'Articles',
  description:
    'Guides and comparisons on product analytics, web analytics, self-hosting and the tools around them.',
  url: url('/articles'),
  image: getOgImageUrl('/articles'),
});

export default async function Page() {
  const [latest, ...rest] = (await articleSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  return (
    <div>
      <HeroContainer className="pb-10 md:pb-14">
        <SectionHeader
          as="h1"
          description="Guides and comparisons on product analytics, web analytics, self-hosting and the tools around them."
          title="Articles"
        />
      </HeroContainer>

      <div className="col container gap-16 pb-8">
        {latest && (
          <ArticleCard
            cover={resolveArticleCover(latest.data.cover)}
            date={latest.data.date}
            description={latest.data.description}
            featured
            tag={latest.data.tag}
            title={latest.data.title}
            url={latest.url}
          />
        )}
        <ul className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 md:grid-cols-3">
          {rest.map((item) => (
            <li key={item.url}>
              <ArticleCard
                cover={resolveArticleCover(item.data.cover)}
                date={item.data.date}
                tag={item.data.tag}
                title={item.data.title}
                url={item.url}
              />
            </li>
          ))}
        </ul>
      </div>
      <CtaBanner />
    </div>
  );
}
