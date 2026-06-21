import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import { localizedHref, type AppLocale } from '@/i18n/routing';
import type { ForRelatedLinks } from '@/lib/for';
import { useTranslations } from 'next-intl';

interface ForRelatedLinksProps {
  relatedLinks: ForRelatedLinks;
  locale: AppLocale;
}

export function ForRelatedLinksSection({
  relatedLinks,
  locale,
}: ForRelatedLinksProps) {
  const common = useTranslations('common');
  const pages = useTranslations('pages');
  const hasLinks =
    relatedLinks.articles?.length ||
    relatedLinks.guides?.length ||
    relatedLinks.comparisons?.length;

  if (!hasLinks) {
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
            {relatedLinks.guides.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(link.url, locale)}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.articles && relatedLinks.articles.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              {common('articles')}
            </h3>
            {relatedLinks.articles.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(link.url, locale)}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.comparisons && relatedLinks.comparisons.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              {common('comparisons')}
            </h3>
            {relatedLinks.comparisons.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={localizedHref(link.url, locale)}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
