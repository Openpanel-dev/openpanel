import type { Metadata } from 'next';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { GuideCard } from '@/components/guide-card';
import { Section, SectionHeader } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { guideSource } from '@/lib/source';

export const metadata: Metadata = getPageMetadata({
  title: 'Implementation Guides',
  description:
    'Step-by-step tutorials for adding privacy-first analytics to your app with OpenPanel.',
  url: url('/guides'),
  image: getOgImageUrl('/guides'),
});

export default async function Page() {
  const guides = (await guideSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
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
          align="center"
          as="h1"
          className="flex-1"
          description="Step-by-step tutorials for adding privacy-first analytics to your app with OpenPanel."
          title="Implementation Guides"
        />
      </HeroContainer>

      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        id="guides-itemlist-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />

      <Section className="container grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
        {guides.map((item) => (
          <GuideCard
            cover={item.data.cover}
            date={item.data.date}
            difficulty={item.data.difficulty}
            key={item.url}
            team={item.data.team}
            timeToComplete={item.data.timeToComplete}
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
