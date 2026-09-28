import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import type { RelatedLinks } from '@/lib/compare';

interface RelatedLinksProps {
  relatedLinks?: RelatedLinks;
}

export function RelatedLinksSection({ relatedLinks }: RelatedLinksProps) {
  if (
    !(
      relatedLinks &&
      (relatedLinks.guides?.length ||
        relatedLinks.articles?.length ||
        relatedLinks.alternatives?.length)
    )
  ) {
    return null;
  }

  return (
    <Section className="container">
      <SectionHeader
        description="Explore more comparisons and guides to help you choose the right analytics tool."
        title="Related resources"
        variant="sm"
      />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {relatedLinks.guides && relatedLinks.guides.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              Guides
            </h3>
            {relatedLinks.guides.map((guide) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={guide.url}
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
              Articles
            </h3>
            {relatedLinks.articles.map((article) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={article.url}
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
              Comparisons
            </h3>
            {relatedLinks.alternatives.map((alternative) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={alternative.url}
                key={alternative.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {alternative.name} alternative
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
