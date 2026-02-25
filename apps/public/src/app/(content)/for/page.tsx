import { ArrowRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { SectionHeader } from '@/components/section';
import { getAllForSlugs, getForData } from '@/lib/for';
import { getPageMetadata } from '@/lib/metadata';

export function generateMetadata(): Metadata {
  return getPageMetadata({
    title: 'OpenPanel for Your Use Case',
    description:
      'Discover how OpenPanel helps startups, developers, and agencies with privacy-first, open-source web and product analytics.',
    url: '/for',
  });
}

export default async function ForListPage() {
  const slugs = await getAllForSlugs();
  const pages = await Promise.all(
    slugs.map(async (slug) => {
      const data = await getForData(slug);
      return data;
    })
  );
  const validPages = pages.filter(
    (page): page is NonNullable<typeof page> => page !== null
  );

  return (
    <HeroContainer divider={false}>
      <SectionHeader
        as="h1"
        description="See how OpenPanel helps different teams and industries with privacy-first, open-source analytics."
        title="OpenPanel for Your Use Case"
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validPages.map((page) => (
          <Link
            className="col gap-3 rounded-2xl border p-6 transition-colors hover:border-primary"
            href={`/for/${page.slug}`}
            key={page.slug}
          >
            <h2 className="font-semibold text-lg">{page.hero.heading}</h2>
            <p className="line-clamp-3 text-muted-foreground text-sm">
              {page.seo.description}
            </p>
            <div className="row mt-auto items-center gap-1 pt-2 text-primary text-sm">
              Learn more <ArrowRightIcon className="size-4" />
            </div>
          </Link>
        ))}
      </div>
    </HeroContainer>
  );
}
