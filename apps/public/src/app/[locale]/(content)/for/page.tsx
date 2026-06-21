import { ArrowRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { SectionHeader } from '@/components/section';
import { getAppLocale } from '@/i18n/server';
import { getAllForSlugs, getForData } from '@/lib/for';
import { getPageMetadata } from '@/lib/metadata';
import { getOgImageUrl } from '@/lib/metadata';
import { getTranslations } from 'next-intl/server';
import { url } from '@/lib/layout.shared';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    title: t('for_title'),
    description: t('for_description'),
    url: url('/for'),
    image: getOgImageUrl('/for'),
  });
}

export default async function ForListPage() {
  const locale = await getAppLocale();
  const t = await getTranslations('pages');
  const common = await getTranslations('common');
  const slugs = await getAllForSlugs(locale);
  const pages = await Promise.all(slugs.map(async (slug) => getForData(slug, locale)));
  const validPages = pages.filter(
    (page): page is NonNullable<typeof page> => page !== null,
  );

  return (
    <HeroContainer divider={false}>
      <SectionHeader
        as="h1"
        description={t('for_intro')}
        title={t('for_title')}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validPages.map((page) => (
          <Link
            className="col gap-3 rounded-2xl border p-6 transition-colors hover:border-primary"
            href={page.url}
            key={page.slug}
          >
            <h2 className="font-semibold text-lg">{page.hero.heading}</h2>
            <p className="line-clamp-3 text-muted-foreground text-sm">
              {page.seo.description}
            </p>
            <div className="row mt-auto items-center gap-1 pt-2 text-primary text-sm">
              {common('learn_more')} <ArrowRightIcon className="size-4" />
            </div>
          </Link>
        ))}
      </div>
    </HeroContainer>
  );
}
