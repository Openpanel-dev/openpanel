import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import { localizedHref, type AppLocale } from '@/i18n/routing';
import type { RelatedLinks } from '@/lib/compare';
import { useTranslations } from 'next-intl';

interface RelatedLinksProps {
  relatedLinks?: RelatedLinks;
  locale: AppLocale;
}

export function RelatedLinksSection({
  relatedLinks,
  locale,
}: RelatedLinksProps) {
  const common = useTranslations('common');
  const pages = useTranslations('pages');

  if (
    !relatedLinks ||
    (!relatedLinks.guides?.length && !relatedLinks.articles?.length && !relatedLinks.alternatives?.length)
  ) {
    return null;
  }

  return (
    <Section className="container">
      <SectionHeader
        description={pages('compare_related_description')}
        title={pages('compare_related_title')}
        variant="sm"
      />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {relatedLinks.guides && relatedLinks.guides.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              {common('guides')}
            </h3>
            {relatedLinks.guides.map((guide) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(guide.url, locale)}
                key={guide.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {guide.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.articles && relatedLinks.articles.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              {common('articles')}
            </h3>
            {relatedLinks.articles.map((article) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(article.url, locale)}
                key={article.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {article.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.alternatives && relatedLinks.alternatives.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              {common('comparisons')}
            </h3>
            {relatedLinks.alternatives.map((alternative) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(alternative.url, locale)}
                key={alternative.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {alternative.name} {common('alternative')}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
