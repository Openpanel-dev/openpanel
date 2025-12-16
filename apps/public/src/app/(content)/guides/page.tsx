import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { GuideCard } from '@/components/guide-card';
import { Section, SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { guideSource } from '@/lib/source';
import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = getPageMetadata({
  title: 'Implementation Guides',
  description:
    'Step-by-step tutorials for adding privacy-first analytics to your app with OpenPanel.',
  url: url('/guides'),
  image: getOgImageUrl('/guides'),
});

export default async function Page() {
  const guides = (await guideSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  // Create ItemList schema for SEO
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'OpenPanel Implementation Guides',
    description: 'Step-by-step tutorials for adding analytics to your app',
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
          title="Implementation Guides"
          description="Step-by-step tutorials for adding privacy-first analytics to your app with OpenPanel."
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
      <CtaBanner />
    </div>
  );
}
